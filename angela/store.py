from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from .database import Database


DEFAULT_PERSONA: dict[str, Any] = {
    "warmth": 7,
    "humor": 4,
    "directness": 7,
    "initiative": 4,
    "response_length": "balanced",
    "topics_to_avoid": [],
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ProfileStore:
    def __init__(self, database: Database):
        self.database = database

    def ensure_default(self) -> dict[str, Any]:
        now = utc_now()
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO profiles
                    (id, user_name, companion_name, persona_json, created_at, updated_at)
                VALUES (1, ?, ?, ?, ?, ?)
                """,
                ("Bạn", "Angela", json.dumps(DEFAULT_PERSONA), now, now),
            )
        return self.get()

    def get(self) -> dict[str, Any]:
        with self.database.connect() as connection:
            row = connection.execute("SELECT * FROM profiles WHERE id = 1").fetchone()
        if row is None:
            return self.ensure_default()
        result = dict(row)
        result["persona"] = json.loads(result.pop("persona_json"))
        return result

    def update_names(
        self, user_name: str | None = None, companion_name: str | None = None
    ) -> dict[str, Any]:
        current = self.get()
        user = (user_name or current["user_name"]).strip()[:60]
        companion = (companion_name or current["companion_name"]).strip()[:60]
        if not user or not companion:
            raise ValueError("Tên không được để trống")
        with self.database.connect() as connection:
            connection.execute(
                """
                UPDATE profiles
                SET user_name = ?, companion_name = ?, updated_at = ?
                WHERE id = 1
                """,
                (user, companion, utc_now()),
            )
        return self.get()

    def update_persona_field(self, field: str, value: Any, reason: str) -> dict[str, Any]:
        now = utc_now()
        with self.database.connect() as connection:
            return self.update_persona_field_in_transaction(
                connection, field, value, reason, now
            )

    @staticmethod
    def update_persona_field_in_transaction(
        connection: sqlite3.Connection,
        field: str,
        value: Any,
        reason: str,
        now: str,
    ) -> dict[str, Any]:
        """Write profile and behavior version through the caller's transaction."""

        current = connection.execute("SELECT * FROM profiles WHERE id = 1").fetchone()
        if current is None:
            raise ValueError("Profile chưa được khởi tạo")
        persona = json.loads(current["persona_json"])
        persona[field] = value
        previous = connection.execute(
            "SELECT id FROM behavior_versions ORDER BY id DESC LIMIT 1"
        ).fetchone()
        cursor = connection.execute(
            """
            INSERT INTO behavior_versions (parent_id, persona_json, reason, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                previous["id"] if previous else None,
                json.dumps(persona, ensure_ascii=False),
                reason,
                now,
            ),
        )
        connection.execute(
            "UPDATE profiles SET persona_json = ?, updated_at = ? WHERE id = 1",
            (json.dumps(persona, ensure_ascii=False), now),
        )
        updated = dict(current)
        updated["persona"] = persona
        updated.pop("persona_json", None)
        updated["updated_at"] = now
        updated["behavior_version_id"] = cursor.lastrowid
        return updated


class ConversationStore:
    def __init__(self, database: Database):
        self.database = database

    def create(self, title: str = "Cuộc trò chuyện mới") -> dict[str, Any]:
        now = utc_now()
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO conversations (title, created_at, updated_at)
                VALUES (?, ?, ?)
                """,
                (title.strip()[:100] or "Cuộc trò chuyện mới", now, now),
            )
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return dict(row)

    def latest_or_create(self) -> dict[str, Any]:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM conversations ORDER BY updated_at DESC, id DESC LIMIT 1"
            ).fetchone()
        return dict(row) if row else self.create()

    def list(self, limit: int = 30) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM conversations
                ORDER BY updated_at DESC, id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def exists(self, conversation_id: int) -> bool:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()
        return row is not None

    def add_message(self, conversation_id: int, role: str, content: str) -> dict[str, Any]:
        if role not in {"user", "assistant", "system", "tool"}:
            raise ValueError("Vai trò tin nhắn không hợp lệ")
        now = utc_now()
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO messages (conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (conversation_id, role, content, now),
            )
            connection.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )
            if role == "user":
                count = connection.execute(
                    "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
                    (conversation_id,),
                ).fetchone()["n"]
                if count == 1:
                    clean_title = " ".join(content.split())[:58]
                    connection.execute(
                        "UPDATE conversations SET title = ? WHERE id = ?",
                        (clean_title or "Cuộc trò chuyện mới", conversation_id),
                    )
            row = connection.execute(
                "SELECT * FROM messages WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return dict(row)

    def delete_message(self, message_id: int) -> bool:
        """Remove a pending/failed turn so retries do not duplicate user messages."""
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT conversation_id FROM messages WHERE id = ?", (message_id,)
            ).fetchone()
            if row is None:
                return False
            conversation_id = int(row["conversation_id"])
            recalled_memories = connection.execute(
                """
                SELECT memory_id, COUNT(*) AS access_count
                FROM memory_access_log
                WHERE message_id = ?
                GROUP BY memory_id
                """,
                (message_id,),
            ).fetchall()
            for recalled in recalled_memories:
                memory_id = int(recalled["memory_id"])
                connection.execute(
                    """
                    UPDATE memories
                    SET access_count = MAX(0, access_count - ?),
                        last_accessed_at = (
                            SELECT MAX(created_at)
                            FROM memory_access_log
                            WHERE memory_id = ?
                              AND (message_id IS NULL OR message_id <> ?)
                        )
                    WHERE id = ?
                    """,
                    (
                        int(recalled["access_count"]),
                        memory_id,
                        message_id,
                        memory_id,
                    ),
                )
            connection.execute(
                "DELETE FROM memory_access_log WHERE message_id = ?", (message_id,)
            )
            connection.execute("DELETE FROM messages WHERE id = ?", (message_id,))
            remaining = connection.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()["n"]
            if remaining == 0:
                connection.execute(
                    """
                    UPDATE conversations
                    SET title = 'Cuộc trò chuyện mới', updated_at = ?
                    WHERE id = ?
                    """,
                    (utc_now(), conversation_id),
                )
        return True

    def recent_messages(
        self, conversation_id: int, limit: int = 10
    ) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM (
                    SELECT * FROM messages
                    WHERE conversation_id = ?
                    ORDER BY id DESC LIMIT ?
                ) ORDER BY id ASC
                """,
                (conversation_id, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def all_messages(self, conversation_id: int, limit: int = 200) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT m.*, f.score AS feedback_score, f.note AS feedback_note
                FROM messages m
                LEFT JOIN feedback f ON f.message_id = m.id
                WHERE m.conversation_id = ?
                ORDER BY m.id DESC LIMIT ?
                """,
                (conversation_id, limit),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def add_feedback(self, message_id: int, score: int, note: str = "") -> None:
        if score not in {-1, 1}:
            raise ValueError("Feedback phải là -1 hoặc 1")
        with self.database.connect() as connection:
            role = connection.execute(
                "SELECT role FROM messages WHERE id = ?", (message_id,)
            ).fetchone()
            if role is None or role["role"] != "assistant":
                raise ValueError("Chỉ có thể đánh giá câu trả lời của Angela")
            connection.execute(
                """
                INSERT INTO feedback (message_id, score, note, created_at, reflected_at)
                VALUES (?, ?, ?, ?, NULL)
                ON CONFLICT(message_id) DO UPDATE SET
                    score = excluded.score,
                    note = excluded.note,
                    created_at = excluded.created_at,
                    reflected_at = NULL
                """,
                (message_id, score, note.strip()[:500], utc_now()),
            )
