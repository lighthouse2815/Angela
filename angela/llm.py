from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterator

from .config import Settings


class LLMError(RuntimeError):
    pass


class LLMUnavailable(LLMError):
    pass


@dataclass(slots=True)
class LLMResponse:
    content: str
    model: str
    usage: dict[str, Any]


@dataclass(slots=True)
class LLMStreamEvent:
    kind: str
    content: str = ""
    model: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    finish_reason: str | None = None


class _ReasoningStreamFilter:
    """Hide <think> blocks even when their tags are split across SSE chunks."""

    start_tag = "<think>"
    end_tag = "</think>"

    def __init__(self) -> None:
        self.buffer = ""
        self.in_reasoning = False

    @staticmethod
    def _partial_tag_suffix(value: str, tag: str) -> int:
        maximum = min(len(value), len(tag) - 1)
        for size in range(maximum, 0, -1):
            if value.endswith(tag[:size]):
                return size
        return 0

    def feed(self, chunk: str) -> str:
        self.buffer += chunk
        output: list[str] = []
        while self.buffer:
            if self.in_reasoning:
                end = self.buffer.casefold().find(self.end_tag)
                if end < 0:
                    keep = self._partial_tag_suffix(
                        self.buffer.casefold(), self.end_tag
                    )
                    self.buffer = self.buffer[-keep:] if keep else ""
                    break
                self.buffer = self.buffer[end + len(self.end_tag) :]
                self.in_reasoning = False
                continue

            start = self.buffer.casefold().find(self.start_tag)
            if start >= 0:
                output.append(self.buffer[:start])
                self.buffer = self.buffer[start + len(self.start_tag) :]
                self.in_reasoning = True
                continue

            keep = self._partial_tag_suffix(self.buffer.casefold(), self.start_tag)
            if keep:
                output.append(self.buffer[:-keep])
                self.buffer = self.buffer[-keep:]
            else:
                output.append(self.buffer)
                self.buffer = ""
            break
        return "".join(output)

    def finish(self) -> str:
        if self.in_reasoning:
            self.buffer = ""
            return ""
        remaining = self.buffer
        self.buffer = ""
        return remaining


class OpenAICompatibleLLM:
    def __init__(self, settings: Settings):
        self.settings = settings

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.78,
        max_tokens: int = 520,
        json_mode: bool = False,
    ) -> LLMResponse:
        payload = self._completion_payload(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=json_mode,
            stream=False,
        )
        data = self._request_json(
            f"{self.settings.llm_base_url}/chat/completions",
            payload,
            timeout=self.settings.llm_timeout_seconds,
        )
        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"Phản hồi LLM không đúng định dạng: {exc}") from exc
        if isinstance(content, list):
            content = "".join(
                item.get("text", "") for item in content if isinstance(item, dict)
            )
        clean = self._strip_reasoning(str(content)).strip()
        if not clean:
            raise LLMError("Mô hình trả về nội dung rỗng")
        return LLMResponse(
            content=clean,
            model=str(data.get("model", self.settings.llm_model)),
            usage=data.get("usage", {}),
        )

    def stream_complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.78,
        max_tokens: int = 520,
    ) -> Iterator[LLMStreamEvent]:
        payload = self._completion_payload(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=False,
            stream=True,
        )
        payload["stream_options"] = {"include_usage": True}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Accept": "text/event-stream",
            "Content-Type": "application/json; charset=utf-8",
        }
        if self.settings.llm_api_key:
            headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"
        request = urllib.request.Request(
            f"{self.settings.llm_base_url}/chat/completions",
            data=body,
            headers=headers,
        )

        try:
            response = urllib.request.urlopen(
                request, timeout=self.settings.llm_timeout_seconds
            )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise LLMError(f"LLM trả lỗi HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LLMUnavailable(
                "Không kết nối được bộ não LLM. Hãy chạy mô hình local hoặc cấu hình API."
            ) from exc

        model = self.settings.llm_model
        usage: dict[str, Any] = {}
        finish_reason: str | None = None
        done_seen = False
        content_parts: list[str] = []
        reasoning_filter = _ReasoningStreamFilter()
        try:
            with response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="strict").strip()
                    if not line or line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    encoded = line[5:].strip()
                    if encoded == "[DONE]":
                        done_seen = True
                        break
                    try:
                        data = json.loads(encoded)
                    except json.JSONDecodeError as exc:
                        raise LLMError("LLM trả stream JSON sai định dạng") from exc
                    if not isinstance(data, dict):
                        raise LLMError("LLM trả stream không hợp lệ")

                    if "error" in data:
                        error = data["error"]
                        if isinstance(error, dict):
                            detail = error.get("message") or error.get("code") or error.get("type")
                        else:
                            detail = error
                        clean_detail = " ".join(str(detail or "lỗi không xác định").split())[:400]
                        raise LLMError(f"LLM báo lỗi trong stream: {clean_detail}")

                    reported_model = data.get("model")
                    if reported_model is not None:
                        if not isinstance(reported_model, str):
                            raise LLMError("LLM trả model trong stream sai định dạng")
                        model = reported_model or model

                    raw_usage = data.get("usage")
                    if raw_usage is not None:
                        if not isinstance(raw_usage, dict):
                            raise LLMError("LLM trả usage trong stream sai định dạng")
                        usage = raw_usage

                    if "choices" not in data:
                        raise LLMError("LLM trả stream thiếu choices")
                    choices = data["choices"]
                    if not isinstance(choices, list):
                        raise LLMError("LLM trả choices trong stream sai định dạng")
                    if not choices:
                        if isinstance(raw_usage, dict):
                            continue
                        raise LLMError("LLM trả choices rỗng ngoài sự kiện usage")
                    if not isinstance(choices[0], dict):
                        raise LLMError("LLM trả choice trong stream sai định dạng")
                    choice = choices[0]
                    raw_finish_reason = choice.get("finish_reason")
                    if raw_finish_reason is not None:
                        if not isinstance(raw_finish_reason, str):
                            raise LLMError(
                                "LLM trả finish_reason trong stream sai định dạng"
                            )
                        finish_reason = raw_finish_reason
                    if "delta" not in choice:
                        raise LLMError("LLM trả choice trong stream thiếu delta")
                    delta = choice["delta"]
                    if not isinstance(delta, dict):
                        raise LLMError("LLM trả delta trong stream sai định dạng")
                    raw_content = delta.get("content")
                    if raw_content is not None and not isinstance(
                        raw_content, (str, list)
                    ):
                        raise LLMError("LLM trả content trong stream sai định dạng")
                    if isinstance(raw_content, list):
                        for item in raw_content:
                            if (
                                not isinstance(item, dict)
                                or "text" not in item
                                or not isinstance(item["text"], str)
                            ):
                                raise LLMError(
                                    "LLM trả content part trong stream sai định dạng"
                                )
                    content = self._content_text(raw_content)
                    if not content:
                        continue
                    visible = reasoning_filter.feed(content)
                    if visible:
                        content_parts.append(visible)
                        yield LLMStreamEvent(
                            kind="delta", content=visible, model=model
                        )
        except UnicodeDecodeError as exc:
            raise LLMError("LLM trả stream không phải UTF-8 hợp lệ") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LLMUnavailable("Kết nối tới LLM bị ngắt giữa câu trả lời") from exc

        tail = reasoning_filter.finish()
        if tail:
            content_parts.append(tail)
            yield LLMStreamEvent(kind="delta", content=tail, model=model)
        if not done_seen:
            raise LLMError("Stream LLM kết thúc sớm trước tín hiệu [DONE]")
        final_content = self._strip_reasoning("".join(content_parts)).strip()
        if not final_content:
            raise LLMError("Mô hình trả về nội dung rỗng")
        yield LLMStreamEvent(
            kind="done",
            content=final_content,
            model=model,
            usage=usage,
            finish_reason=finish_reason,
        )

    def complete_json(
        self, messages: list[dict[str, str]], *, max_tokens: int = 700
    ) -> dict[str, Any]:
        response = self.complete(
            messages,
            temperature=0.15,
            max_tokens=max_tokens,
            json_mode=True,
        )
        return self._parse_json_object(response.content)

    def health(self, timeout: int = 2) -> dict[str, Any]:
        try:
            data = self._request_json(
                f"{self.settings.llm_base_url}/models", None, timeout=timeout
            )
            models = data.get("data", []) if isinstance(data, dict) else []
            return {
                "available": True,
                "configured_model": self.settings.llm_model,
                "reported_models": [
                    item.get("id") for item in models[:10] if isinstance(item, dict)
                ],
            }
        except LLMError as exc:
            return {
                "available": False,
                "configured_model": self.settings.llm_model,
                "error": str(exc),
            }

    def _request_json(
        self, url: str, payload: dict[str, Any] | None, *, timeout: int
    ) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        if self.settings.llm_api_key:
            headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"
        request = urllib.request.Request(url, data=body, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise LLMError(f"LLM trả lỗi HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LLMUnavailable(
                "Không kết nối được bộ não LLM. Hãy chạy mô hình local hoặc cấu hình API."
            ) from exc
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LLMError("LLM không trả về JSON hợp lệ") from exc
        if not isinstance(data, dict):
            raise LLMError("LLM trả về dữ liệu không hợp lệ")
        return data

    def _completion_payload(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        stream: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.settings.llm_model,
            "messages": messages,
            "temperature": temperature,
            "top_p": 0.9,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        return payload

    @staticmethod
    def _content_text(content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, list):
            return "".join(
                str(item.get("text", ""))
                for item in content
                if isinstance(item, dict)
            )
        return str(content)

    @staticmethod
    def _strip_reasoning(content: str) -> str:
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.S | re.I)
        content = re.sub(r"^```(?:text|markdown)?\s*", "", content.strip(), flags=re.I)
        content = re.sub(r"\s*```$", "", content.strip())
        return content

    @staticmethod
    def _parse_json_object(content: str) -> dict[str, Any]:
        cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                raise LLMError("Không tìm thấy JSON trong phản hồi của mô hình")
            try:
                parsed = json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError as exc:
                raise LLMError("Mô hình trả JSON sai định dạng") from exc
        if not isinstance(parsed, dict):
            raise LLMError("JSON của mô hình phải là một object")
        return parsed
