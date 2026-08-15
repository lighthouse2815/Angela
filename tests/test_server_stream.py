from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from angela.config import Settings
from angela.llm import LLMStreamEvent, LLMUnavailable
from angela.server import AngelaApplication, make_handler


class FakeStreamingLLM:
    def __init__(self) -> None:
        self.fail_after_delta = False
        self.block_before_delta = False
        self.upstream_entered = threading.Event()
        self.release_upstream = threading.Event()
        self.stream_call_count = 0

    def health(self, timeout: int = 2):
        return {
            "available": True,
            "configured_model": "fake-stream",
            "reported_models": ["fake-stream"],
        }

    def stream_complete(self, *_args, **_kwargs):
        self.stream_call_count += 1
        self.upstream_entered.set()
        if self.block_before_delta and not self.release_upstream.wait(timeout=5):
            raise LLMUnavailable("blocked stream timed out")
        yield LLMStreamEvent(kind="delta", content="Xin ")
        if self.fail_after_delta:
            raise LLMUnavailable("stream offline")
        yield LLMStreamEvent(kind="delta", content="chào")
        yield LLMStreamEvent(
            kind="done",
            content="Xin chào",
            model="fake-stream",
            usage={"completion_tokens": 2},
            finish_reason="stop",
        )


class StreamingServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        settings = Settings(
            root_dir=root,
            data_dir=root / "data",
            database_path=root / "data" / "angela.db",
            static_dir=root / "static",
            host="127.0.0.1",
            port=0,
            llm_base_url="http://127.0.0.1:1/v1",
            llm_model="fake-stream",
            llm_api_key="",
            llm_timeout_seconds=1,
            context_messages=10,
            memory_limit=3,
        )
        self.application = AngelaApplication(settings)
        self.llm = FakeStreamingLLM()
        self.application.llm = self.llm
        self.application.companion.llm = self.llm
        self.application.extractor.llm = self.llm
        self.application.growth.llm = self.llm
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), make_handler(self.application)
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.application.shutdown()
        self.temporary.cleanup()

    def post_stream(
        self,
        conversation_id: int,
        message: str,
        request_id: str = "test-request-0001",
    ):
        request = urllib.request.Request(
            self.base_url + "/api/chat/stream",
            data=json.dumps(
                {
                    "conversation_id": conversation_id,
                    "message": message,
                    "request_id": request_id,
                },
                ensure_ascii=False,
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return urllib.request.urlopen(request, timeout=10)

    def post_cancel(self, request_id: str) -> dict:
        request = urllib.request.Request(
            self.base_url + "/api/chat/cancel",
            data=json.dumps({"request_id": request_id}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def test_ndjson_stream_commits_only_on_done(self) -> None:
        conversation = self.application.conversations.create()

        with self.post_stream(
            conversation["id"], "Bạn có thể trả lời ngắn không?"
        ) as response:
            content_type = response.headers.get_content_type()
            events = [json.loads(line) for line in response if line.strip()]

        self.assertEqual(content_type, "application/x-ndjson")
        self.assertEqual(
            [event["type"] for event in events],
            ["start", "delta", "delta", "done"],
        )
        request_ids = {event["request_id"] for event in events}
        self.assertEqual(len(request_ids), 1)
        self.assertEqual(events[-1]["assistant_message"]["content"], "Xin chào")
        self.assertEqual(events[-1]["finish_reason"], "stop")
        self.assertEqual(
            [
                message["role"]
                for message in self.application.conversations.all_messages(
                    conversation["id"]
                )
            ],
            ["user", "assistant"],
        )

    def test_stream_error_emits_error_event_and_rolls_back_turn(self) -> None:
        self.llm.fail_after_delta = True
        conversation = self.application.conversations.create()

        with self.post_stream(
            conversation["id"], "Bạn có thể trả lời ngắn không?"
        ) as response:
            events = [json.loads(line) for line in response if line.strip()]

        self.assertEqual(
            [event["type"] for event in events], ["start", "delta", "error"]
        )
        self.assertEqual(events[-1]["code"], "llm_unavailable")
        self.assertTrue(events[-1]["retryable"])
        self.assertEqual(
            self.application.conversations.all_messages(conversation["id"]), []
        )

    def test_invalid_secret_fails_as_json_before_stream_headers(self) -> None:
        conversation = self.application.conversations.create()

        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.post_stream(
                conversation["id"],
                "Mật khẩu của tôi là correct-horse-battery-staple",
            )

        self.assertEqual(raised.exception.code, 400)
        self.assertEqual(
            raised.exception.headers.get_content_type(), "application/json"
        )
        self.assertEqual(
            self.application.conversations.all_messages(conversation["id"]), []
        )

    def test_explicit_cancel_rolls_back_a_turn_blocked_in_upstream(self) -> None:
        self.llm.block_before_delta = True
        conversation = self.application.conversations.create()
        request_id = "blocked-request-0001"

        with patch.object(
            self.application.extractor,
            "capture_explicit",
            wraps=self.application.extractor.capture_explicit,
        ) as capture_explicit:
            with self.post_stream(
                conversation["id"],
                "Hãy kể mình nghe một câu chuyện.",
                request_id,
            ) as response:
                start = json.loads(response.readline())
                self.assertEqual(start["type"], "start")
                self.assertTrue(self.llm.upstream_entered.wait(timeout=2))

                acknowledgement = self.post_cancel(request_id)
                self.assertTrue(acknowledgement["ok"])
                self.assertTrue(acknowledgement["cancelled"])
                self.assertTrue(acknowledgement["matched_active"])
                self.llm.release_upstream.set()
                remaining = [
                    json.loads(line) for line in response if line.strip()
                ]

        self.assertEqual([event["type"] for event in remaining], ["error"])
        self.assertEqual(remaining[0]["code"], "chat_cancelled")
        self.assertFalse(remaining[0]["retryable"])
        self.assertEqual(
            self.application.conversations.all_messages(conversation["id"]), []
        )
        capture_explicit.assert_not_called()

    def test_cancel_tombstone_wins_when_cancel_arrives_before_stream(self) -> None:
        conversation = self.application.conversations.create()
        request_id = "early-cancel-0001"

        acknowledgement = self.post_cancel(request_id)
        self.assertTrue(acknowledgement["ok"])
        self.assertFalse(acknowledgement["matched_active"])
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.post_stream(
                conversation["id"],
                "Hãy kể mình nghe một câu chuyện.",
                request_id,
            )

        self.assertEqual(raised.exception.code, 409)
        self.assertEqual(self.llm.stream_call_count, 0)
        self.assertEqual(
            self.application.conversations.all_messages(conversation["id"]), []
        )


if __name__ == "__main__":
    unittest.main()
