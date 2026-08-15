from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from angela.database import Database
from angela.extractor import MemoryExtractor
from angela.llm import LLMError
from angela.memory import MemoryStore, forbids_memory, stable_slug


class MemoryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temporary.name) / "angela.db"
        self.database = Database(self.database_path)
        self.database.initialize()
        self.memories = MemoryStore(self.database)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_memory_survives_restart_and_is_retrieved_after_noise(self) -> None:
        target = self.memories.add(
            kind="event",
            subject="sinh_nhat_me",
            content="Sinh nhật của mẹ An diễn ra ngày 12 tháng 3 tại nhà.",
            event_at="2026-03-12",
            importance=0.92,
        )
        self.assertIsNotNone(target)
        for index in range(120):
            self.memories.add(
                kind="event",
                subject=f"noise_{index}",
                content=f"Ghi chú không liên quan về quyển sách số {index}.",
                importance=0.2,
            )

        restarted = MemoryStore(Database(self.database_path))
        recalled = restarted.retrieve("Sinh nhật mẹ tổ chức ở đâu và ngày nào?", limit=5)

        self.assertTrue(recalled)
        self.assertEqual(recalled[0].id, target["id"])
        self.assertEqual(recalled[0].event_at, "2026-03-12")

    def test_new_fact_supersedes_old_fact_with_same_subject(self) -> None:
        old = self.memories.add(
            kind="fact",
            subject="noi_o_hien_tai",
            content="An đang sống ở Hà Nội.",
        )
        new = self.memories.add(
            kind="fact",
            subject="noi_o_hien_tai",
            content="An đã chuyển vào Thành phố Hồ Chí Minh.",
        )

        self.assertEqual(new["supersedes_id"], old["id"])
        active = self.memories.list()
        self.assertEqual([item["id"] for item in active], [new["id"]])
        recalled = self.memories.retrieve("An đang sống ở đâu?", limit=5)
        self.assertTrue(all(item.id != old["id"] for item in recalled))

    def test_secrets_and_no_memory_requests_are_rejected(self) -> None:
        secret = self.memories.add(
            kind="fact",
            subject="api_key",
            content="API key của tôi là sk-abcdefghijklmnop123456.",
        )
        forbidden = self.memories.add(
            kind="fact",
            subject="private_note",
            content="Đừng lưu chuyện này, hôm nay tôi thấy mệt.",
        )

        self.assertIsNone(secret)
        self.assertIsNone(forbidden)
        self.assertEqual(self.memories.list(), [])

    def test_delete_removes_content_from_fts_and_active_memory(self) -> None:
        memory = self.memories.add(
            kind="preference",
            subject="do_uong_yeu_thich",
            content="An thích cà phê đen không đường.",
        )
        self.assertTrue(self.memories.delete(memory["id"]))
        self.assertEqual(self.memories.list(), [])
        self.assertEqual(self.memories.retrieve("An thích uống cà phê gì?"), [])
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT content, status FROM memories WHERE id = ?", (memory["id"],)
            ).fetchone()
            fts_row = connection.execute(
                "SELECT 1 FROM memory_fts WHERE memory_id = ?", (memory["id"],)
            ).fetchone()
        self.assertEqual(row["content"], "[đã quên]")
        self.assertEqual(row["status"], "deleted")
        self.assertIsNone(fts_row)

    def test_explicit_compound_memory_is_split_without_an_llm_call(self) -> None:
        class LLMThatMustNotRun:
            def complete_json(self, *_args, **_kwargs):
                raise AssertionError("Explicit capture must stay local and lightweight")

        extractor = MemoryExtractor(LLMThatMustNotRun(), self.memories)
        stored = extractor.capture_explicit(
            source_message_id=None,
            user_text=(
                "Hãy nhớ rằng sinh nhật mẹ mình là ngày 12 tháng 3 "
                "và mình thường mua hoa hướng dương cho mẹ."
            ),
        )

        self.assertEqual(len(stored), 2)
        self.assertEqual(
            {item["subject"] for item in stored},
            {"sinh_nhat_me", "qua_thuong_mua_cho_me"},
        )
        birthday = next(item for item in stored if item["subject"] == "sinh_nhat_me")
        self.assertEqual(birthday["event_at"], "--03-12")
        self.assertEqual(birthday["origin"], "user_explicit")

    def test_preference_correction_supersedes_previous_value(self) -> None:
        class NoopLLM:
            pass

        extractor = MemoryExtractor(NoopLLM(), self.memories)
        first = extractor.capture_explicit(
            source_message_id=None, user_text="Hãy nhớ mình thích màu đỏ."
        )
        second = extractor.capture_explicit(
            source_message_id=None, user_text="Hãy nhớ mình thích màu xanh."
        )

        self.assertEqual(first[0]["subject"], "mau_yeu_thich")
        self.assertEqual(second[0]["subject"], "mau_yeu_thich")
        self.assertEqual(second[0]["supersedes_id"], first[0]["id"])
        self.assertEqual([item["id"] for item in self.memories.list()], [second[0]["id"]])

    def test_single_value_preference_phrase_and_vietnamese_slug_are_stable(self) -> None:
        class NoopLLM:
            pass

        extractor = MemoryExtractor(NoopLLM(), self.memories)
        first = extractor.capture_explicit(
            source_message_id=None,
            user_text="Hãy nhớ màu yêu thích của mình là đỏ.",
        )
        second = extractor.capture_explicit(
            source_message_id=None,
            user_text="Hãy nhớ màu yêu thích của mình là xanh.",
        )

        self.assertEqual(first[0]["subject"], "mau_yeu_thich")
        self.assertEqual(second[0]["supersedes_id"], first[0]["id"])
        self.assertEqual(stable_slug("đỏ"), "do")

    def test_independent_nonexclusive_likes_can_coexist(self) -> None:
        class NoopLLM:
            pass

        extractor = MemoryExtractor(NoopLLM(), self.memories)
        extractor.capture_explicit(
            source_message_id=None, user_text="Hãy nhớ mình thích cà phê."
        )
        extractor.capture_explicit(
            source_message_id=None, user_text="Hãy nhớ mình thích trà."
        )

        self.assertEqual(len(self.memories.list()), 2)

    def test_natural_opt_out_is_never_stored(self) -> None:
        class NoopLLM:
            pass

        text = "Mình thích cà phê nhưng bạn không cần nhớ chuyện này."
        extractor = MemoryExtractor(NoopLLM(), self.memories)

        self.assertTrue(forbids_memory(text))
        self.assertFalse(extractor.should_extract(text))
        self.assertEqual(
            extractor.capture_explicit(source_message_id=None, user_text=text), []
        )

    def test_automatic_extraction_records_llm_provenance(self) -> None:
        class ExtractionLLM:
            def complete_json(self, *_args, **_kwargs):
                return {
                    "memories": [
                        {
                            "kind": "preference",
                            "subject": "do_uong_yeu_thich",
                            "content": "Người dùng thích trà nóng.",
                        }
                    ]
                }

        extractor = MemoryExtractor(ExtractionLLM(), self.memories)
        stored = extractor.extract_and_store(
            source_message_id=None,
            user_text="Mình thích trà nóng.",
            assistant_text="Mình đã nghe.",
        )

        self.assertEqual(stored[0]["origin"], "llm_extracted")

    def test_automatic_fallback_records_heuristic_provenance(self) -> None:
        class FailingLLM:
            def complete_json(self, *_args, **_kwargs):
                raise LLMError("offline")

        extractor = MemoryExtractor(FailingLLM(), self.memories)
        stored = extractor.extract_and_store(
            source_message_id=None,
            user_text="Mình thích màu tím.",
            assistant_text="Mình đã nghe.",
        )

        self.assertEqual(stored[0]["origin"], "heuristic_extracted")

    def test_question_is_never_captured_as_a_new_memory(self) -> None:
        class NoopLLM:
            pass

        extractor = MemoryExtractor(NoopLLM(), self.memories)
        text = (
            "Sinh nhật mẹ mình ngày nào, và mình thường mua hoa gì cho mẹ? "
            "Chỉ nói điều bạn thật sự nhớ."
        )

        stored = extractor.capture_explicit(source_message_id=None, user_text=text)

        self.assertEqual(stored, [])
        self.assertFalse(extractor.should_extract(text))
        self.assertEqual(self.memories.list(), [])

    def test_unrelated_greeting_does_not_surface_pinned_memory(self) -> None:
        self.memories.add(
            kind="event",
            subject="sinh_nhat_me",
            content="Sinh nhật mẹ An là ngày 12 tháng 3.",
            importance=0.95,
            pinned=True,
        )

        recalled = self.memories.retrieve(
            "Chào Angela, trả lời mình một câu thật tự nhiên nhé."
        )

        self.assertEqual(recalled, [])


if __name__ == "__main__":
    unittest.main()
