from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from angela.config import Settings
from angela.server import AngelaApplication, make_handler


class EvidenceAwareLLM:
    def __init__(self) -> None:
        self.call_count = 0

    def complete_json(self, messages, *, max_tokens=700):
        self.call_count += 1
        payload = json.loads(messages[1]["content"])
        negative_ids = [
            item["message_id"]
            for item in payload["feedback"]
            if item["score"] == -1
        ]
        return {
            "proposals": [
                {
                    "field": "humor",
                    "value": 3,
                    "title": "Bớt pha trò",
                    "rationale": "Nhiều phản hồi không hợp với mức hài hước hiện tại.",
                    "evidence_message_ids": negative_ids[:3],
                }
            ]
        }


class GrowthServerTests(unittest.TestCase):
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
            llm_model="fake-growth",
            llm_api_key="",
            llm_timeout_seconds=1,
            context_messages=10,
            memory_limit=3,
        )
        self.application = AngelaApplication(settings)
        self.llm = EvidenceAwareLLM()
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

    def get_json(self, path: str) -> dict:
        with urllib.request.urlopen(self.base_url + path, timeout=5) as response:
            return json.load(response)

    def post_json(self, path: str, payload: dict) -> dict:
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)

    def make_answer(self, conversation_id: int, index: int) -> int:
        self.application.conversations.add_message(
            conversation_id, "user", f"Câu hỏi {index}"
        )
        answer = self.application.conversations.add_message(
            conversation_id, "assistant", f"Câu trả lời {index}"
        )
        return int(answer["id"])

    def test_status_endpoint_reports_evidence_gate(self) -> None:
        payload = self.get_json("/api/growth/status")

        self.assertEqual(payload["status"]["state"], "waiting_feedback")
        self.assertEqual(payload["status"]["required_feedback"], 8)
        self.assertFalse(payload["status"]["eligible"])

    def test_eighth_feedback_schedules_reflection_without_auto_apply(self) -> None:
        conversations = [
            self.application.conversations.create("A"),
            self.application.conversations.create("B"),
        ]
        for index in range(7):
            message_id = self.make_answer(
                conversations[index % 2]["id"], index
            )
            self.application.conversations.add_feedback(
                message_id,
                -1 if index < 3 else 1,
                "Bớt pha trò" if index < 3 else "Ổn",
            )
        final_message_id = self.make_answer(conversations[1]["id"], 7)

        response = self.post_json(
            "/api/feedback",
            {"message_id": final_message_id, "score": 1, "note": "Ổn"},
        )

        self.assertTrue(response["reflection_scheduled"])
        self.application._growth_future.result(timeout=5)
        proposals = self.application.growth.list()
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0]["status"], "pending")
        self.assertEqual(self.application.profiles.get()["persona"]["humor"], 4)
        with self.application.database.connect() as connection:
            versions = connection.execute(
                "SELECT COUNT(*) AS n FROM behavior_versions"
            ).fetchone()["n"]
        self.assertEqual(versions, 0)
        self.assertEqual(self.llm.call_count, 1)


if __name__ == "__main__":
    unittest.main()
