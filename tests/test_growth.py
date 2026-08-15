from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from angela.database import Database
from angela.growth import GrowthService
from angela.store import ConversationStore, ProfileStore, utc_now


class MutableClock:
    def __init__(self, value: datetime):
        self.value = value

    def __call__(self) -> datetime:
        return self.value

    def advance(self, delta: timedelta) -> None:
        self.value += delta


class FakeReflectionLLM:
    def __init__(self):
        self.payload: dict = {"proposals": []}
        self.error: Exception | None = None
        self.call_count = 0
        self.last_messages: list[dict[str, str]] = []

    def complete_json(self, messages, *, max_tokens=700):
        self.call_count += 1
        self.last_messages = messages
        if self.error is not None:
            raise self.error
        return self.payload


class GrowthServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.database = Database(Path(self.temporary.name) / "angela.db")
        self.database.initialize()
        self.profiles = ProfileStore(self.database)
        self.profiles.ensure_default()
        self.conversations = ConversationStore(self.database)
        self.clock = MutableClock(
            datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
        )
        self.llm = FakeReflectionLLM()
        self.growth = GrowthService(
            self.database,
            self.profiles,
            self.llm,
            now_provider=self.clock,
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def seed_feedback(
        self,
        count: int = 8,
        *,
        negative: int = 3,
        conversation_count: int = 2,
        interval: timedelta = timedelta(minutes=5),
    ) -> list[int]:
        conversations = [
            self.conversations.create(f"Conversation {index}")
            for index in range(conversation_count)
        ]
        start = self.clock.value - interval * max(0, count - 1)
        assistant_ids: list[int] = []
        for index in range(count):
            conversation = conversations[index % conversation_count]
            self.conversations.add_message(
                conversation["id"], "user", f"Câu hỏi thật {index}"
            )
            assistant = self.conversations.add_message(
                conversation["id"], "assistant", f"Câu trả lời thật {index}"
            )
            score = -1 if index < negative else 1
            note = "Bớt pha trò" if score == -1 else "Ổn"
            self.conversations.add_feedback(assistant["id"], score, note)
            created_at = (start + interval * index).isoformat(timespec="seconds")
            with self.database.connect() as connection:
                connection.execute(
                    "UPDATE feedback SET created_at = ? WHERE message_id = ?",
                    (created_at, assistant["id"]),
                )
            assistant_ids.append(int(assistant["id"]))
        return assistant_ids

    def set_humor_proposal(self, evidence_ids: list[int], value: int = 3) -> None:
        self.llm.payload = {
            "proposals": [
                {
                    "field": "humor",
                    "value": value,
                    "title": "Bớt pha trò",
                    "rationale": "Ba feedback cho thấy trò đùa lặp lại không hợp ý.",
                    "evidence_message_ids": evidence_ids,
                    "risk": "low",
                }
            ]
        }

    def insert_proposal(
        self, field: str, value, *, base_value_marker=...,
    ) -> int:
        base_value_json = (
            None
            if base_value_marker is ...
            else json.dumps(base_value_marker, ensure_ascii=False)
        )
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO growth_proposals (
                    field, proposed_value_json, title, rationale,
                    evidence_json, risk, status, created_at, base_value_json
                ) VALUES (?, ?, 'Điều chỉnh', 'Có feedback rõ ràng',
                          '[]', 'low', 'pending', ?, ?)
                """,
                (field, json.dumps(value), utc_now(), base_value_json),
            )
        return int(cursor.lastrowid)

    def proposal_count(self) -> int:
        with self.database.connect() as connection:
            return int(
                connection.execute(
                    "SELECT COUNT(*) AS n FROM growth_proposals"
                ).fetchone()["n"]
            )

    def behavior_version_count(self) -> int:
        with self.database.connect() as connection:
            return int(
                connection.execute(
                    "SELECT COUNT(*) AS n FROM behavior_versions"
                ).fetchone()["n"]
            )

    def test_evidence_gate_does_not_call_llm_early(self) -> None:
        self.seed_feedback(count=7, negative=3)

        self.assertEqual(self.growth.status()["state"], "waiting_feedback")
        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.llm.call_count, 0)

    def test_gate_requires_negative_signal_and_diversity(self) -> None:
        self.seed_feedback(count=8, negative=2)
        self.assertEqual(
            self.growth.status()["state"], "waiting_negative_feedback"
        )

        with self.database.connect() as connection:
            connection.execute("DELETE FROM feedback")
            connection.execute("DELETE FROM messages")
            connection.execute("DELETE FROM conversations")
        self.seed_feedback(
            count=8,
            negative=3,
            conversation_count=1,
            interval=timedelta(minutes=1),
        )
        self.assertEqual(self.growth.status()["state"], "waiting_diversity")
        self.assertEqual(self.llm.call_count, 0)

    def test_reflection_creates_one_pending_proposal_without_auto_apply(self) -> None:
        ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(ids[:3])

        created = self.growth.analyze(trigger="feedback")

        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["status"], "pending")
        self.assertEqual(created[0]["base_value"], 4)
        self.assertEqual(created[0]["evidence"], ids[:3])
        self.assertEqual(self.profiles.get()["persona"]["humor"], 4)
        self.assertEqual(self.behavior_version_count(), 0)
        self.assertEqual(self.llm.call_count, 1)
        llm_payload = json.loads(self.llm.last_messages[1]["content"])
        self.assertEqual(len(llm_payload["feedback"]), 8)
        self.assertIn("user_message", llm_payload["feedback"][0])
        with self.database.connect() as connection:
            reflected = connection.execute(
                "SELECT COUNT(*) AS n FROM feedback WHERE reflected_at IS NOT NULL"
            ).fetchone()["n"]
            run_status = connection.execute(
                "SELECT status FROM growth_reflection_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()["status"]
        self.assertEqual(reflected, 8)
        self.assertEqual(run_status, "completed")

    def test_reflection_payload_is_bounded_to_ten_feedback_items(self) -> None:
        ids = self.seed_feedback(count=12, negative=3)
        self.set_humor_proposal(ids[:3])

        self.growth.analyze()

        llm_payload = json.loads(self.llm.last_messages[1]["content"])
        self.assertEqual(len(llm_payload["feedback"]), 10)
        with self.database.connect() as connection:
            run = connection.execute(
                """
                SELECT feedback_count FROM growth_reflection_runs
                ORDER BY id DESC LIMIT 1
                """
            ).fetchone()
            reflected = connection.execute(
                "SELECT COUNT(*) AS n FROM feedback WHERE reflected_at IS NOT NULL"
            ).fetchone()["n"]
        self.assertEqual(run["feedback_count"], 10)
        self.assertEqual(reflected, 10)

    def test_model_cannot_invent_evidence_or_make_large_change(self) -> None:
        ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal([ids[0], ids[1], 999_999])

        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.proposal_count(), 0)

        self.clock.advance(timedelta(hours=24, seconds=1))
        new_ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(new_ids[:3], value=1)
        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.proposal_count(), 0)

    def test_cooldown_blocks_new_batch_until_clock_advances(self) -> None:
        ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(ids[:3])
        self.growth.analyze()
        first_call_count = self.llm.call_count

        new_ids = self.seed_feedback(count=8, negative=3)
        self.llm.payload = {
            "proposals": [
                {
                    "field": "directness",
                    "value": 6,
                    "title": "Mềm hơn một chút",
                    "rationale": "Phản hồi lặp lại yêu cầu giọng mềm hơn.",
                    "evidence_message_ids": new_ids[:3],
                }
            ]
        }
        self.assertEqual(self.growth.status()["state"], "cooldown")
        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.llm.call_count, first_call_count)

        self.clock.advance(timedelta(hours=24, seconds=1))
        created = self.growth.analyze()
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["field"], "directness")
        self.assertEqual(self.llm.call_count, first_call_count + 1)

    def test_pending_field_and_recent_rejection_are_deduplicated(self) -> None:
        ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(ids[:3])
        first = self.growth.analyze()[0]

        self.clock.advance(timedelta(hours=24, seconds=1))
        more_ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(more_ids[:3], value=5)
        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.proposal_count(), 1)

        self.growth.reject(first["id"])
        self.clock.advance(timedelta(hours=24, seconds=1))
        final_ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(final_ids[:3], value=3)
        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.proposal_count(), 1)

    def test_failed_run_retries_after_delay_without_consuming_feedback(self) -> None:
        ids = self.seed_feedback(count=8, negative=3)
        self.set_humor_proposal(ids[:3])
        self.llm.error = RuntimeError("model offline")

        with self.assertRaisesRegex(RuntimeError, "model offline"):
            self.growth.analyze()
        self.assertEqual(self.growth.status()["state"], "retry_wait")
        self.assertEqual(self.llm.call_count, 1)
        with self.database.connect() as connection:
            reflected = connection.execute(
                "SELECT COUNT(*) AS n FROM feedback WHERE reflected_at IS NOT NULL"
            ).fetchone()["n"]
        self.assertEqual(reflected, 0)

        self.assertEqual(self.growth.analyze(), [])
        self.assertEqual(self.llm.call_count, 1)
        self.clock.advance(timedelta(minutes=15, seconds=1))
        self.llm.error = None
        self.assertEqual(len(self.growth.analyze()), 1)
        self.assertEqual(self.llm.call_count, 2)
        with self.database.connect() as connection:
            run = connection.execute(
                """
                SELECT COUNT(*) AS n, MAX(attempt_count) AS attempts
                FROM growth_reflection_runs
                """
            ).fetchone()
        self.assertEqual(run["n"], 1)
        self.assertEqual(run["attempts"], 2)

    def test_feedback_edit_becomes_unreflected_again(self) -> None:
        message_id = self.seed_feedback(count=1, negative=1)[0]
        with self.database.connect() as connection:
            connection.execute(
                "UPDATE feedback SET reflected_at = ? WHERE message_id = ?",
                (self.clock.value.isoformat(), message_id),
            )

        self.conversations.add_feedback(message_id, -1, "Lý do mới")

        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT note, reflected_at FROM feedback WHERE message_id = ?",
                (message_id,),
            ).fetchone()
        self.assertEqual(row["note"], "Lý do mới")
        self.assertIsNone(row["reflected_at"])

    def test_apply_creates_version_and_updates_allowed_persona_field(self) -> None:
        proposal_id = self.insert_proposal("humor", 3)

        result = self.growth.apply(proposal_id)

        self.assertEqual(result["profile"]["persona"]["humor"], 3)
        self.assertEqual(self.behavior_version_count(), 1)

    def test_apply_rejects_unapproved_capability_field(self) -> None:
        proposal_id = self.insert_proposal("filesystem_permission", "all")

        with self.assertRaisesRegex(ValueError, "không được phép"):
            self.growth.apply(proposal_id)
        self.assertNotIn("filesystem_permission", self.profiles.get()["persona"])

    def test_stale_proposal_is_not_applied(self) -> None:
        proposal_id = self.insert_proposal("humor", 3, base_value_marker=4)
        self.profiles.update_persona_field("humor", 5, "User changed it")

        with self.assertRaisesRegex(ValueError, "đã cũ"):
            self.growth.apply(proposal_id)

        self.assertEqual(self.profiles.get()["persona"]["humor"], 5)
        self.assertEqual(self.behavior_version_count(), 1)
        self.assertEqual(self.growth.list()[0]["status"], "stale")

    def test_concurrent_apply_can_create_only_one_version(self) -> None:
        proposal_id = self.insert_proposal("humor", 3)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(self.growth.apply, proposal_id) for _ in range(2)]
            outcomes = []
            for future in futures:
                try:
                    outcomes.append(future.result()["proposal"]["status"])
                except ValueError:
                    outcomes.append("rejected")

        self.assertCountEqual(outcomes, ["applied", "rejected"])
        self.assertEqual(self.behavior_version_count(), 1)


class GrowthMigrationTests(unittest.TestCase):
    def test_initialize_migrates_pre_reflection_database(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.db"
            connection = sqlite3.connect(path)
            connection.executescript(
                """
                CREATE TABLE feedback (
                    message_id INTEGER PRIMARY KEY,
                    score INTEGER NOT NULL,
                    note TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE growth_proposals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    field TEXT NOT NULL,
                    proposed_value_json TEXT NOT NULL,
                    title TEXT NOT NULL,
                    rationale TEXT NOT NULL,
                    evidence_json TEXT NOT NULL DEFAULT '[]',
                    risk TEXT NOT NULL DEFAULT 'low',
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    reviewed_at TEXT
                );
                """
            )
            connection.close()

            database = Database(path)
            database.initialize()

            with database.connect() as migrated:
                feedback_columns = {
                    row["name"]
                    for row in migrated.execute("PRAGMA table_info(feedback)")
                }
                proposal_columns = {
                    row["name"]
                    for row in migrated.execute(
                        "PRAGMA table_info(growth_proposals)"
                    )
                }
                reflection_table = migrated.execute(
                    """
                    SELECT name FROM sqlite_master
                    WHERE type = 'table' AND name = 'growth_reflection_runs'
                    """
                ).fetchone()

            self.assertIn("reflected_at", feedback_columns)
            self.assertIn("reflection_run_id", proposal_columns)
            self.assertIn("base_value_json", proposal_columns)
            self.assertIsNotNone(reflection_table)


if __name__ == "__main__":
    unittest.main()
