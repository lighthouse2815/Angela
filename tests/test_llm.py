from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from angela.config import Settings
from angela.llm import LLMError, OpenAICompatibleLLM


class FakeStreamResponse:
    def __init__(self, lines: list[str]):
        self.lines = [line.encode("utf-8") + b"\n" for line in lines]
        self.closed = False

    def __iter__(self):
        return iter(self.lines)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.closed = True


def sse(payload) -> str:
    if payload == "[DONE]":
        return "data: [DONE]"
    return "data: " + json.dumps(payload, ensure_ascii=False)


class StreamingLLMTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        settings = Settings(
            root_dir=root,
            data_dir=root,
            database_path=root / "angela.db",
            static_dir=root,
            host="127.0.0.1",
            port=0,
            llm_base_url="http://127.0.0.1:9999/v1",
            llm_model="fake-stream",
            llm_api_key="",
            llm_timeout_seconds=2,
            context_messages=10,
            memory_limit=3,
        )
        self.llm = OpenAICompatibleLLM(settings)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_stream_handles_role_content_usage_and_done_frames(self) -> None:
        response = FakeStreamResponse(
            [
                sse(
                    {
                        "model": "served-model",
                        "choices": [{"delta": {"role": "assistant", "content": None}}],
                    }
                ),
                sse({"choices": [{"delta": {"content": "Xin"}}]}),
                sse({"choices": [{"delta": {"content": " chào"}}]}),
                sse(
                    {
                        "choices": [
                            {"delta": {}, "finish_reason": "stop"}
                        ]
                    }
                ),
                sse(
                    {
                        "choices": [],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 2},
                    }
                ),
                sse("[DONE]"),
            ]
        )

        with patch("urllib.request.urlopen", return_value=response):
            events = list(
                self.llm.stream_complete(
                    [{"role": "user", "content": "Chào"}], max_tokens=20
                )
            )

        self.assertEqual([event.kind for event in events], ["delta", "delta", "done"])
        self.assertEqual("".join(event.content for event in events[:-1]), "Xin chào")
        self.assertEqual(events[-1].content, "Xin chào")
        self.assertEqual(events[-1].model, "served-model")
        self.assertEqual(events[-1].finish_reason, "stop")
        self.assertEqual(events[-1].usage["completion_tokens"], 2)
        self.assertTrue(response.closed)

    def test_reasoning_tags_split_across_chunks_are_never_emitted(self) -> None:
        response = FakeStreamResponse(
            [
                sse({"choices": [{"delta": {"content": "<thi"}}]}),
                sse({"choices": [{"delta": {"content": "nk>secret"}}]}),
                sse({"choices": [{"delta": {"content": "</think>Visible"}}]}),
                sse({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
                sse("[DONE]"),
            ]
        )

        with patch("urllib.request.urlopen", return_value=response):
            events = list(
                self.llm.stream_complete([{"role": "user", "content": "Hi"}])
            )

        visible = "".join(event.content for event in events if event.kind == "delta")
        self.assertEqual(visible, "Visible")
        self.assertEqual(events[-1].content, "Visible")

    def test_premature_or_malformed_stream_is_rejected(self) -> None:
        for lines in (
            [sse({"choices": [{"delta": {"content": "partial"}}]})],
            ["data: {not-json", sse("[DONE]")],
            [sse({"choices": [{"delta": {"content": None}}]}), sse("[DONE]")],
        ):
            with self.subTest(lines=lines):
                response = FakeStreamResponse(lines)
                with patch("urllib.request.urlopen", return_value=response):
                    with self.assertRaises(LLMError):
                        list(
                            self.llm.stream_complete(
                                [{"role": "user", "content": "Hi"}]
                            )
                        )
                self.assertTrue(response.closed)

    def test_error_and_malformed_schema_cannot_commit_partial_stream(self) -> None:
        malformed_events = (
            {"error": {"message": "GPU worker failed"}},
            {"choices": {"not": "a list"}},
            {"choices": ["not an object"]},
            {"choices": [{"delta": "not an object"}]},
            {"choices": []},
            {"usage": "not an object", "choices": []},
        )
        for malformed in malformed_events:
            with self.subTest(malformed=malformed):
                response = FakeStreamResponse(
                    [
                        sse({"choices": [{"delta": {"content": "partial"}}]}),
                        sse(malformed),
                        sse("[DONE]"),
                    ]
                )
                with patch("urllib.request.urlopen", return_value=response):
                    with self.assertRaises(LLMError):
                        list(
                            self.llm.stream_complete(
                                [{"role": "user", "content": "Hi"}]
                            )
                        )
                self.assertTrue(response.closed)

    def test_closing_consumer_closes_upstream_response(self) -> None:
        response = FakeStreamResponse(
            [
                sse({"choices": [{"delta": {"content": "first"}}]}),
                sse({"choices": [{"delta": {"content": "second"}}]}),
                sse("[DONE]"),
            ]
        )
        with patch("urllib.request.urlopen", return_value=response):
            stream = self.llm.stream_complete(
                [{"role": "user", "content": "Hi"}]
            )
            self.assertEqual(next(stream).content, "first")
            stream.close()

        self.assertTrue(response.closed)


if __name__ == "__main__":
    unittest.main()
