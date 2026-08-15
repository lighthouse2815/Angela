from __future__ import annotations

import json
import mimetypes
import re
import signal
import sys
import threading
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .companion import ChatCancelled, CompanionService
from .config import Settings
from .database import Database
from .extractor import MemoryExtractor
from .growth import GrowthService
from .llm import LLMError, LLMUnavailable, OpenAICompatibleLLM
from .memory import MemoryStore
from .store import ConversationStore, ProfileStore


LOCAL_HTTP_HOSTS = {"127.0.0.1", "localhost", "::1"}
CHAT_REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{8,96}")
CHAT_CANCEL_TOMBSTONE_TTL_SECONDS = 300.0
MAX_CHAT_CANCEL_TOMBSTONES = 2_048


def request_is_local(host_header: str | None, origin: str | None) -> bool:
    if not host_header:
        return False
    try:
        host = urlparse(f"//{host_header}").hostname
    except ValueError:
        return False
    if not host or host.casefold() not in LOCAL_HTTP_HOSTS:
        return False
    if origin:
        try:
            origin_host = urlparse(origin).hostname
        except ValueError:
            return False
        if not origin_host or origin_host.casefold() not in LOCAL_HTTP_HOSTS:
            return False
    return True


class AngelaApplication:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.database = Database(settings.database_path)
        self.database.initialize()
        self.profiles = ProfileStore(self.database)
        self.profiles.ensure_default()
        self.conversations = ConversationStore(self.database)
        self.memories = MemoryStore(self.database)
        self.llm = OpenAICompatibleLLM(settings)
        self.companion = CompanionService(
            settings,
            self.profiles,
            self.conversations,
            self.memories,
            self.llm,
        )
        self.extractor = MemoryExtractor(self.llm, self.memories)
        self.growth = GrowthService(self.database, self.profiles, self.llm)
        self.executor = ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="angela-background"
        )
        self._growth_schedule_lock = threading.Lock()
        self._growth_future: Any = None
        self._chat_cancel_lock = threading.Lock()
        self._active_chat_cancellations: dict[str, threading.Event] = {}
        self._chat_cancel_tombstones: dict[str, float] = {}
        self.schedule_growth_reflection("startup")

    def bootstrap(self, conversation_id: int | None = None) -> dict[str, Any]:
        if conversation_id is not None and self.conversations.exists(conversation_id):
            conversation = next(
                item
                for item in self.conversations.list(100)
                if item["id"] == conversation_id
            )
        else:
            conversation = self.conversations.latest_or_create()
        return {
            "profile": self.profiles.get(),
            "conversation": conversation,
            "conversations": self.conversations.list(),
            "messages": self.conversations.all_messages(conversation["id"]),
            "memories": self.memories.list(),
            "growth_proposals": self.growth.list(),
            "growth_status": self.growth_status(),
            "llm": self.llm.health(),
        }

    def growth_status(self) -> dict[str, Any]:
        status = self.growth.status()
        with self._growth_schedule_lock:
            future = self._growth_future
            if (
                future is not None
                and not future.done()
                and status["state"] != "running"
            ):
                status = {**status, "state": "scheduled", "eligible": False}
        return status

    def schedule_growth_reflection(self, trigger: str) -> bool:
        """Queue at most one evidence-gated reflection; it can only propose."""

        with self._growth_schedule_lock:
            if self._growth_future is not None and not self._growth_future.done():
                return False
            if not self.growth.status()["eligible"]:
                return False
            self._growth_future = self.executor.submit(
                self._run_scheduled_reflection, trigger
            )
            return True

    def _run_scheduled_reflection(self, trigger: str) -> None:
        try:
            self.growth.analyze(trigger=trigger)
        except Exception:
            # The run is persisted as failed with a bounded retry time.
            return

    @staticmethod
    def validate_chat_request_id(value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("request_id streaming là bắt buộc")
        request_id = value.strip()
        if not CHAT_REQUEST_ID_PATTERN.fullmatch(request_id):
            raise ValueError(
                "request_id phải dài 8-96 ký tự và chỉ gồm chữ, số, _ hoặc -"
            )
        return request_id

    def register_chat_request(self, request_id: str) -> threading.Event:
        with self._chat_cancel_lock:
            self._prune_chat_cancel_tombstones_locked()
            if request_id in self._active_chat_cancellations:
                raise ValueError("request_id đang được một lượt streaming khác sử dụng")
            cancel_event = threading.Event()
            if request_id in self._chat_cancel_tombstones:
                cancel_event.set()
            self._active_chat_cancellations[request_id] = cancel_event
            return cancel_event

    def cancel_chat_request(self, request_id: str) -> dict[str, Any]:
        with self._chat_cancel_lock:
            self._prune_chat_cancel_tombstones_locked()
            cancel_event = self._active_chat_cancellations.get(request_id)
            if cancel_event is not None:
                cancel_event.set()
            self._chat_cancel_tombstones[request_id] = time.monotonic()
            self._prune_chat_cancel_tombstones_locked()
            return {
                "ok": True,
                "request_id": request_id,
                "cancelled": True,
                "matched_active": cancel_event is not None,
            }

    def release_chat_request(
        self, request_id: str, cancel_event: threading.Event
    ) -> None:
        with self._chat_cancel_lock:
            if self._active_chat_cancellations.get(request_id) is cancel_event:
                del self._active_chat_cancellations[request_id]
            self._prune_chat_cancel_tombstones_locked()

    def _prune_chat_cancel_tombstones_locked(self) -> None:
        cutoff = time.monotonic() - CHAT_CANCEL_TOMBSTONE_TTL_SECONDS
        expired = [
            request_id
            for request_id, cancelled_at in self._chat_cancel_tombstones.items()
            if cancelled_at < cutoff
        ]
        for request_id in expired:
            del self._chat_cancel_tombstones[request_id]
        overflow = len(self._chat_cancel_tombstones) - MAX_CHAT_CANCEL_TOMBSTONES
        if overflow > 0:
            oldest = sorted(
                self._chat_cancel_tombstones,
                key=self._chat_cancel_tombstones.__getitem__,
            )[:overflow]
            for request_id in oldest:
                del self._chat_cancel_tombstones[request_id]

    def shutdown(self) -> None:
        with self._chat_cancel_lock:
            for cancel_event in self._active_chat_cancellations.values():
                cancel_event.set()
        self.executor.shutdown(wait=False, cancel_futures=True)


def make_handler(application: AngelaApplication) -> type[BaseHTTPRequestHandler]:
    class AngelaHandler(BaseHTTPRequestHandler):
        server_version = "Angela/0.1"

        def do_GET(self) -> None:  # noqa: N802
            parsed_url = urlparse(self.path)
            path = parsed_url.path
            try:
                if not self.allow_local_request():
                    return
                if path == "/api/health":
                    self.send_json(
                        {
                            "ok": True,
                            "llm": application.llm.health(),
                            "database": str(application.settings.database_path),
                        }
                    )
                    return
                if path == "/api/bootstrap":
                    query = parse_qs(parsed_url.query)
                    raw_conversation_id = query.get("conversation_id", [None])[0]
                    conversation_id = (
                        int(raw_conversation_id) if raw_conversation_id else None
                    )
                    self.send_json(application.bootstrap(conversation_id))
                    return
                if path == "/api/memories":
                    self.send_json({"memories": application.memories.list()})
                    return
                if path == "/api/growth":
                    self.send_json(
                        {
                            "proposals": application.growth.list(),
                            "status": application.growth_status(),
                        }
                    )
                    return
                if path == "/api/growth/status":
                    self.send_json({"status": application.growth_status()})
                    return
                self.serve_static(path)
            except Exception as exc:  # pragma: no cover - final HTTP safety net
                self.handle_exception(exc)

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            try:
                if not self.allow_local_request():
                    return
                payload = self.read_json()
                if path == "/api/chat/cancel":
                    request_id = application.validate_chat_request_id(
                        payload.get("request_id")
                    )
                    self.send_json(application.cancel_chat_request(request_id))
                    return
                if path == "/api/chat/stream":
                    self.send_chat_stream(payload)
                    return
                if path == "/api/chat":
                    result = application.companion.chat(
                        self.optional_int(payload.get("conversation_id")),
                        str(payload.get("message", "")),
                    )
                    result_payload = result.as_dict()
                    self.schedule_memory_extraction(result_payload)
                    self.send_json(result_payload, HTTPStatus.CREATED)
                    return
                if path == "/api/conversations":
                    conversation = application.conversations.create(
                        str(payload.get("title", "Cuộc trò chuyện mới"))
                    )
                    self.send_json({"conversation": conversation}, HTTPStatus.CREATED)
                    return
                if path == "/api/memories":
                    result = application.memories.add(
                        kind=str(payload.get("kind", "fact")),
                        subject=str(payload.get("subject", "ghi_nho_thu_cong")),
                        content=str(payload.get("content", "")),
                        tags=payload.get("tags", []),
                        event_at=payload.get("event_at") or None,
                        confidence=1.0,
                        importance=payload.get("importance", 0.8),
                        pinned=bool(payload.get("pinned", True)),
                    )
                    if result is None:
                        raise ValueError(
                            "Ký ức rỗng, bị cấm lưu hoặc có vẻ chứa thông tin bí mật"
                        )
                    self.send_json({"memory": result}, HTTPStatus.CREATED)
                    return
                if path == "/api/feedback":
                    application.conversations.add_feedback(
                        int(payload.get("message_id")),
                        int(payload.get("score")),
                        str(payload.get("note", "")),
                    )
                    scheduled = application.schedule_growth_reflection("feedback")
                    self.send_json(
                        {
                            "ok": True,
                            "reflection_scheduled": scheduled,
                            "growth_status": application.growth_status(),
                        }
                    )
                    return
                if path == "/api/profile":
                    profile = application.profiles.update_names(
                        payload.get("user_name"), payload.get("companion_name")
                    )
                    self.send_json({"profile": profile})
                    return
                if path == "/api/growth/analyze":
                    proposals = application.growth.analyze(trigger="manual")
                    self.send_json(
                        {
                            "proposals": proposals,
                            "status": application.growth_status(),
                        },
                        HTTPStatus.CREATED,
                    )
                    return
                match = re.fullmatch(r"/api/growth/(\d+)/(apply|reject)", path)
                if match:
                    proposal_id = int(match.group(1))
                    action = match.group(2)
                    result = (
                        application.growth.apply(proposal_id)
                        if action == "apply"
                        else application.growth.reject(proposal_id)
                    )
                    self.send_json(result)
                    return
                self.send_json({"error": "Endpoint không tồn tại"}, HTTPStatus.NOT_FOUND)
            except Exception as exc:
                self.handle_exception(exc)

        def do_DELETE(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            try:
                if not self.allow_local_request():
                    return
                match = re.fullmatch(r"/api/memories/(\d+)", path)
                if not match:
                    self.send_json({"error": "Endpoint không tồn tại"}, HTTPStatus.NOT_FOUND)
                    return
                deleted = application.memories.delete(int(match.group(1)))
                if not deleted:
                    self.send_json({"error": "Không tìm thấy ký ức"}, HTTPStatus.NOT_FOUND)
                    return
                self.send_json({"ok": True})
            except Exception as exc:
                self.handle_exception(exc)

        def serve_static(self, path: str) -> None:
            relative = "index.html" if path in {"", "/"} else path.lstrip("/")
            if relative.startswith("assets/"):
                relative = relative[len("assets/") :]
            allowed = {"index.html", "styles.css", "voice-core.js", "app.js"}
            if relative not in allowed:
                self.send_json({"error": "Không tìm thấy"}, HTTPStatus.NOT_FOUND)
                return
            file_path = application.settings.static_dir / relative
            if not file_path.exists():
                self.send_json({"error": "Thiếu file giao diện"}, HTTPStatus.NOT_FOUND)
                return
            content = file_path.read_bytes()
            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in {
                "application/javascript",
                "application/json",
            }:
                content_type += "; charset=utf-8"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(content)

        def send_chat_stream(self, payload: dict[str, Any]) -> None:
            request_id = application.validate_chat_request_id(
                payload.get("request_id")
            )
            cancel_event = application.register_chat_request(request_id)
            stream = None
            response_started = False
            try:
                stream = application.companion.stream_chat(
                    self.optional_int(payload.get("conversation_id")),
                    str(payload.get("message", "")),
                    cancel_event=cancel_event,
                )
                first_event = next(stream)
                self.send_response(HTTPStatus.OK)
                response_started = True
                self.send_header(
                    "Content-Type", "application/x-ndjson; charset=utf-8"
                )
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True
                self.send_stream_event({**first_event, "request_id": request_id})
                for event in stream:
                    is_done = event.get("type") == "done"
                    try:
                        self.send_stream_event({**event, "request_id": request_id})
                    finally:
                        if is_done:
                            self.schedule_memory_extraction(event)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass
            except Exception as exc:
                if not response_started:
                    raise
                try:
                    self.send_stream_event(
                        {**self.stream_error_payload(exc), "request_id": request_id}
                    )
                except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                    pass
            finally:
                if stream is not None:
                    stream.close()
                application.release_chat_request(request_id, cancel_event)

        def send_stream_event(self, event: dict[str, Any]) -> None:
            content = (
                json.dumps(event, ensure_ascii=False, separators=(",", ":"))
                + "\n"
            ).encode("utf-8")
            self.wfile.write(content)
            self.wfile.flush()

        def schedule_memory_extraction(self, result: dict[str, Any]) -> None:
            try:
                user_message = result["user_message"]
                assistant_message = result["assistant_message"]
                captured = application.extractor.capture_explicit(
                    source_message_id=user_message["id"],
                    user_text=user_message["content"],
                )
                if not captured and application.extractor.should_extract(
                    user_message["content"]
                ):
                    application.executor.submit(
                        application.extractor.extract_and_store,
                        source_message_id=user_message["id"],
                        user_text=user_message["content"],
                        assistant_text=assistant_message["content"],
                    )
            except Exception:
                # The committed chat must stay successful if memory extraction fails.
                return

        @staticmethod
        def stream_error_payload(exc: Exception) -> dict[str, Any]:
            if isinstance(exc, ChatCancelled):
                return {
                    "type": "error",
                    "code": "chat_cancelled",
                    "error": str(exc),
                    "retryable": False,
                }
            if isinstance(exc, LLMUnavailable):
                return {
                    "type": "error",
                    "code": "llm_unavailable",
                    "error": str(exc),
                    "retryable": True,
                }
            if isinstance(exc, LLMError):
                return {
                    "type": "error",
                    "code": "llm_protocol",
                    "error": str(exc),
                    "retryable": True,
                }
            return {
                "type": "error",
                "code": "stream_failed",
                "error": "Không thể hoàn tất câu trả lời streaming.",
                "retryable": False,
            }

        def read_json(self) -> dict[str, Any]:
            media_type = self.headers.get("Content-Type", "").split(";", 1)[0]
            if media_type.strip().casefold() != "application/json":
                raise ValueError("Content-Type phải là application/json")
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 2_000_000:
                raise ValueError("Body JSON rỗng hoặc quá lớn")
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("JSON không hợp lệ") from exc
            if not isinstance(payload, dict):
                raise ValueError("JSON phải là một object")
            return payload

        def allow_local_request(self) -> bool:
            if request_is_local(
                self.headers.get("Host"), self.headers.get("Origin")
            ):
                return True
            self.send_json(
                {"error": "Angela chỉ chấp nhận request từ localhost"},
                HTTPStatus.FORBIDDEN,
            )
            return False

        def send_json(
            self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK
        ) -> None:
            content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(content)

        def handle_exception(self, exc: Exception) -> None:
            if isinstance(exc, ChatCancelled):
                status = HTTPStatus.CONFLICT
            elif isinstance(exc, LLMUnavailable):
                status = HTTPStatus.SERVICE_UNAVAILABLE
            elif isinstance(exc, (ValueError, TypeError)):
                status = HTTPStatus.BAD_REQUEST
            elif isinstance(exc, LLMError):
                status = HTTPStatus.BAD_GATEWAY
            else:
                status = HTTPStatus.INTERNAL_SERVER_ERROR
            self.send_json({"error": str(exc)}, status)

        @staticmethod
        def optional_int(value: Any) -> int | None:
            if value in {None, ""}:
                return None
            return int(value)

        def log_message(self, message_format: str, *args: Any) -> None:
            sys.stdout.write(
                f"[{self.log_date_time_string()}] {self.address_string()} "
                f"{message_format % args}\n"
            )

    return AngelaHandler


def run(*, open_browser: bool = False) -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")
    settings = Settings.from_env()
    application = AngelaApplication(settings)
    server = ThreadingHTTPServer(
        (settings.host, settings.port), make_handler(application)
    )
    display_host = f"[{settings.host}]" if ":" in settings.host else settings.host
    url = f"http://{display_host}:{settings.port}"
    print(f"Angela đang chạy tại {url}")
    print(f"Bộ não LLM: {settings.llm_base_url} ({settings.llm_model})")
    print("Nhấn Ctrl+C để dừng.")

    def stop_server(*_: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop_server)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop_server)
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        application.shutdown()
        server.server_close()


if __name__ == "__main__":
    run(open_browser="--open" in sys.argv)
