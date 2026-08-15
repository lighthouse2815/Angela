from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_name TEXT NOT NULL,
    companion_name TEXT NOT NULL,
    persona_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS feedback (
    message_id INTEGER PRIMARY KEY,
    score INTEGER NOT NULL CHECK (score IN (-1, 1)),
    note TEXT,
    created_at TEXT NOT NULL,
    reflected_at TEXT,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_key TEXT,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    event_at TEXT,
    origin TEXT NOT NULL DEFAULT 'user_explicit',
    confidence REAL NOT NULL DEFAULT 0.8,
    importance REAL NOT NULL DEFAULT 0.5,
    pinned INTEGER NOT NULL DEFAULT 0,
    sensitivity TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'active',
    source_message_id INTEGER,
    supersedes_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_accessed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (supersedes_id) REFERENCES memories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_status_kind
ON memories(status, kind);

CREATE INDEX IF NOT EXISTS idx_memories_identity
ON memories(identity_key, status);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    memory_id UNINDEXED,
    subject,
    content,
    tags,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS memory_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    memory_id INTEGER NOT NULL,
    score REAL NOT NULL,
    used_in_prompt INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS growth_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field TEXT NOT NULL,
    proposed_value_json TEXT NOT NULL,
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    risk TEXT NOT NULL DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reflection_run_id INTEGER,
    base_value_json TEXT,
    FOREIGN KEY (reflection_run_id) REFERENCES growth_reflection_runs(id)
);

CREATE TABLE IF NOT EXISTS growth_reflection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    batch_fingerprint TEXT NOT NULL UNIQUE,
    feedback_ids_json TEXT NOT NULL,
    feedback_count INTEGER NOT NULL,
    negative_count INTEGER NOT NULL,
    conversation_count INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    retry_after TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_reflection_status
ON growth_reflection_runs(status, completed_at);

CREATE TABLE IF NOT EXISTS behavior_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    persona_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES behavior_versions(id)
);
"""


class Database:
    def __init__(self, path: Path):
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            self._migrate_growth_schema(connection)

    @staticmethod
    def _migrate_growth_schema(connection: sqlite3.Connection) -> None:
        """Upgrade databases created before Reflection Inbox v1 in place."""

        feedback_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(feedback)").fetchall()
        }
        if "reflected_at" not in feedback_columns:
            connection.execute("ALTER TABLE feedback ADD COLUMN reflected_at TEXT")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS growth_reflection_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trigger TEXT NOT NULL,
                status TEXT NOT NULL,
                batch_fingerprint TEXT NOT NULL UNIQUE,
                feedback_ids_json TEXT NOT NULL,
                feedback_count INTEGER NOT NULL,
                negative_count INTEGER NOT NULL,
                conversation_count INTEGER NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 1,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                retry_after TEXT,
                error TEXT
            )
            """
        )

        proposal_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(growth_proposals)"
            ).fetchall()
        }
        if "reflection_run_id" not in proposal_columns:
            connection.execute(
                "ALTER TABLE growth_proposals ADD COLUMN reflection_run_id INTEGER"
            )
        if "base_value_json" not in proposal_columns:
            connection.execute(
                "ALTER TABLE growth_proposals ADD COLUMN base_value_json TEXT"
            )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_feedback_reflection
            ON feedback(reflected_at, created_at)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_growth_reflection_status
            ON growth_reflection_runs(status, completed_at)
            """
        )

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 20000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
