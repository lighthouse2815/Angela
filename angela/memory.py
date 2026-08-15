from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from .database import Database
from .store import utc_now


MEMORY_KINDS = {
    "fact",
    "preference",
    "event",
    "relationship",
    "goal",
    "boundary",
    "commitment",
    "reflection",
}
MEMORY_ORIGINS = {
    "user_explicit",
    "llm_extracted",
    "heuristic_extracted",
    "imported",
    "unknown",
}

STOP_WORDS = {
    "anh",
    "ban",
    "bạn",
    "bi",
    "bị",
    "cac",
    "các",
    "cai",
    "cái",
    "cho",
    "co",
    "có",
    "cua",
    "của",
    "da",
    "đã",
    "dang",
    "đang",
    "de",
    "để",
    "do",
    "đó",
    "duoc",
    "được",
    "gi",
    "gì",
    "hay",
    "khong",
    "không",
    "la",
    "là",
    "lai",
    "lại",
    "minh",
    "mình",
    "mot",
    "một",
    "nao",
    "nào",
    "nay",
    "này",
    "nhung",
    "nhưng",
    "nho",
    "nhớ",
    "noi",
    "nói",
    "o",
    "ở",
    "rằng",
    "roi",
    "rồi",
    "toi",
    "tôi",
    "trong",
    "va",
    "và",
    "ve",
    "về",
    "voi",
    "với",
}

SECRET_PATTERNS = (
    re.compile(
        r"\b(?:password|mật\s*khẩu|api[-_ ]?key|access[-_ ]?token|"
        r"refresh[-_ ]?token|cookie)\b[^\r\n]{0,32}?(?:là|is|:|=)\s*[\"']?\S{4,}",
        re.I,
    ),
    re.compile(
        r"\b(?:otp|one[- ]time password)\b[^\r\n]{0,24}?\b\d{4,8}\b", re.I
    ),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b", re.I),
)

NO_MEMORY_PATTERNS = (
    re.compile(r"\b(?:đừng|không)\s+(?:ghi|lưu|nhớ)\b", re.I),
    re.compile(
        r"\b(?:không|chẳng)\s+cần\s+(?:bạn\s+)?(?:ghi\s+)?(?:nhớ|lưu)\b",
        re.I,
    ),
    re.compile(
        r"\bkhông\s+muốn\s+(?:bạn\s+)?(?:ghi\s+)?(?:nhớ|lưu)\b", re.I
    ),
    re.compile(r"\b(?:do not|don't)\s+(?:store|save|remember)\b", re.I),
    re.compile(r"\bno\s+need\s+to\s+(?:store|save|remember)\b", re.I),
)

EXPLICIT_MEMORY_PATTERNS = (
    re.compile(r"^\s*(?:hãy\s+)?(?:ghi\s+)?nhớ\b", re.I),
    re.compile(r"\b(?:hãy|giúp|làm\s+ơn)\s+(?:ghi\s+)?nhớ\b", re.I),
    re.compile(r"\b(?:muốn|cần)\s+bạn\s+(?:ghi\s+)?nhớ\b", re.I),
    re.compile(r"\bghi\s+nhớ\s+(?:rằng\s+)?", re.I),
)


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return " ".join(value.split())


def stable_slug(value: str, max_length: int = 64) -> str:
    normalized = unicodedata.normalize("NFD", value.casefold())
    ascii_value = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    ascii_value = ascii_value.replace("đ", "d")
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")
    if slug:
        return slug[:max_length]
    return "memory_" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def contains_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def forbids_memory(text: str) -> bool:
    return any(pattern.search(text) for pattern in NO_MEMORY_PATTERNS)


def explicitly_requests_memory(text: str) -> bool:
    return any(pattern.search(text) for pattern in EXPLICIT_MEMORY_PATTERNS)


def clamp(value: Any, low: float, high: float, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


@dataclass(slots=True)
class RetrievedMemory:
    id: int
    kind: str
    subject: str
    content: str
    event_at: str | None
    importance: float
    confidence: float
    pinned: bool
    score: float
    source_message_id: int | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "subject": self.subject,
            "content": self.content,
            "event_at": self.event_at,
            "importance": self.importance,
            "confidence": self.confidence,
            "pinned": self.pinned,
            "score": round(self.score, 4),
            "source_message_id": self.source_message_id,
        }


class MemoryStore:
    def __init__(self, database: Database):
        self.database = database

    def add(
        self,
        *,
        kind: str,
        subject: str,
        content: str,
        tags: Iterable[str] | None = None,
        event_at: str | None = None,
        origin: str = "user_explicit",
        confidence: float = 0.85,
        importance: float = 0.5,
        pinned: bool = False,
        sensitivity: str = "normal",
        source_message_id: int | None = None,
    ) -> dict[str, Any] | None:
        kind = kind if kind in MEMORY_KINDS else "fact"
        origin = origin if origin in MEMORY_ORIGINS else "unknown"
        subject = " ".join(subject.strip().split())[:120] or "general"
        content = " ".join(content.strip().split())[:1500]
        if not content or contains_secret(content) or forbids_memory(content):
            return None

        clean_tags = sorted(
            {stable_slug(str(tag), 40) for tag in (tags or []) if str(tag).strip()}
        )[:16]
        normalized_content = normalize_text(content)
        content_fingerprint = hashlib.sha256(
            normalized_content.encode("utf-8")
        ).hexdigest()
        stable_kinds = {"fact", "preference", "relationship", "goal", "boundary"}
        identity_key = (
            f"{kind}:{stable_slug(subject)}" if kind in stable_kinds else None
        )
        now = utc_now()

        with self.database.connect() as connection:
            duplicate = connection.execute(
                """
                SELECT * FROM memories
                WHERE status = 'active' AND content = ?
                ORDER BY id DESC LIMIT 1
                """,
                (content,),
            ).fetchone()
            if duplicate:
                connection.execute(
                    """
                    UPDATE memories
                    SET confidence = MAX(confidence, ?),
                        importance = MAX(importance, ?),
                        pinned = MAX(pinned, ?),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        clamp(confidence, 0.05, 1.0, 0.85),
                        clamp(importance, 0.05, 1.0, 0.5),
                        int(pinned),
                        now,
                        duplicate["id"],
                    ),
                )
                row = connection.execute(
                    "SELECT * FROM memories WHERE id = ?", (duplicate["id"],)
                ).fetchone()
                return self._decode_row(row)

            superseded_id = None
            if identity_key:
                previous = connection.execute(
                    """
                    SELECT id, content FROM memories
                    WHERE identity_key = ? AND status = 'active'
                    ORDER BY id DESC LIMIT 1
                    """,
                    (identity_key,),
                ).fetchone()
                if previous and normalize_text(previous["content"]) != normalized_content:
                    superseded_id = previous["id"]
                    connection.execute(
                        """
                        UPDATE memories SET status = 'superseded', updated_at = ?
                        WHERE id = ?
                        """,
                        (now, superseded_id),
                    )
                    connection.execute(
                        "DELETE FROM memory_fts WHERE memory_id = ?", (superseded_id,)
                    )

            cursor = connection.execute(
                """
                INSERT INTO memories (
                    identity_key, kind, subject, content, tags_json, event_at,
                    origin, confidence, importance, pinned, sensitivity,
                    status, source_message_id, supersedes_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
                """,
                (
                    identity_key,
                    kind,
                    subject,
                    content,
                    json.dumps(clean_tags, ensure_ascii=False),
                    event_at,
                    origin,
                    clamp(confidence, 0.05, 1.0, 0.85),
                    clamp(importance, 0.05, 1.0, 0.5),
                    int(pinned),
                    sensitivity if sensitivity in {"normal", "sensitive"} else "normal",
                    source_message_id,
                    superseded_id,
                    now,
                    now,
                ),
            )
            memory_id = int(cursor.lastrowid)
            connection.execute(
                """
                INSERT INTO memory_fts (memory_id, subject, content, tags)
                VALUES (?, ?, ?, ?)
                """,
                (memory_id, subject, content, " ".join(clean_tags)),
            )
            row = connection.execute(
                "SELECT * FROM memories WHERE id = ?", (memory_id,)
            ).fetchone()
        result = self._decode_row(row)
        result["fingerprint"] = content_fingerprint[:12]
        return result

    def list(self, limit: int = 100, include_inactive: bool = False) -> list[dict[str, Any]]:
        where = "" if include_inactive else "WHERE status = 'active'"
        with self.database.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT * FROM memories {where}
                ORDER BY pinned DESC, importance DESC, created_at DESC
                LIMIT ?
                """,
                (max(1, min(500, limit)),),
            ).fetchall()
        return [self._decode_row(row) for row in rows]

    def delete(self, memory_id: int) -> bool:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT id FROM memories WHERE id = ? AND status != 'deleted'",
                (memory_id,),
            ).fetchone()
            if row is None:
                return False
            connection.execute(
                """
                UPDATE memories
                SET content = '[đã quên]', subject = '[đã quên]', tags_json = '[]',
                    status = 'deleted', updated_at = ?
                WHERE id = ?
                """,
                (utc_now(), memory_id),
            )
            connection.execute(
                "DELETE FROM memory_fts WHERE memory_id = ?", (memory_id,)
            )
        return True

    def retrieve(
        self,
        query: str,
        *,
        limit: int = 7,
        source_message_id: int | None = None,
    ) -> list[RetrievedMemory]:
        limit = max(1, min(12, limit))
        terms = self._query_terms(query)
        candidate_rows: list[Any] = []
        if terms:
            expression = " OR ".join(f'"{term}"*' for term in terms[:12])
            with self.database.connect() as connection:
                candidate_rows = connection.execute(
                    """
                    SELECT m.*, bm25(memory_fts, 2.2, 1.0, 0.5) AS lexical_rank
                    FROM memory_fts
                    JOIN memories m ON m.id = memory_fts.memory_id
                    WHERE memory_fts MATCH ? AND m.status = 'active'
                    ORDER BY lexical_rank ASC
                    LIMIT 40
                    """,
                    (expression,),
                ).fetchall()

        recall_intent = bool(
            re.search(
                r"\b(?:bạn\s+nhớ|còn\s+nhớ|nhớ\s+gì|lần\s+trước|hôm\s+trước|đã\s+kể|biết\s+gì\s+về)\b",
                query.casefold(),
            )
        )
        if not candidate_rows and recall_intent:
            with self.database.connect() as connection:
                candidate_rows = connection.execute(
                    """
                    SELECT m.*, 100.0 AS lexical_rank
                    FROM memories m
                    WHERE m.status = 'active' AND (m.pinned = 1 OR m.importance >= 0.82)
                    ORDER BY m.pinned DESC, m.importance DESC, m.created_at DESC
                    LIMIT 8
                    """
                ).fetchall()

        now = datetime.now(timezone.utc)
        scored: list[RetrievedMemory] = []
        for rank_position, row in enumerate(candidate_rows):
            created_at = self._parse_datetime(row["created_at"])
            age_days = max(0.0, (now - created_at).total_seconds() / 86400)
            recency = 1.0 / (1.0 + math.log1p(age_days) / 4.0)
            lexical = 1.0 / (1.0 + rank_position)
            score = (
                0.56 * lexical
                + 0.18 * float(row["importance"])
                + 0.10 * float(row["confidence"])
                + 0.08 * recency
                + 0.05 * min(1.0, int(row["access_count"]) / 8.0)
                + 0.03 * int(row["pinned"])
            )
            scored.append(
                RetrievedMemory(
                    id=int(row["id"]),
                    kind=row["kind"],
                    subject=row["subject"],
                    content=row["content"],
                    event_at=row["event_at"],
                    importance=float(row["importance"]),
                    confidence=float(row["confidence"]),
                    pinned=bool(row["pinned"]),
                    score=score,
                    source_message_id=row["source_message_id"],
                )
            )

        selected = sorted(scored, key=lambda memory: memory.score, reverse=True)[:limit]
        if selected:
            recalled_at = utc_now()
            with self.database.connect() as connection:
                for memory in selected:
                    connection.execute(
                        """
                        UPDATE memories
                        SET access_count = access_count + 1, last_accessed_at = ?
                        WHERE id = ?
                        """,
                        (recalled_at, memory.id),
                    )
                    connection.execute(
                        """
                        INSERT INTO memory_access_log
                            (message_id, memory_id, score, used_in_prompt, created_at)
                        VALUES (?, ?, ?, 1, ?)
                        """,
                        (source_message_id, memory.id, memory.score, recalled_at),
                    )
        return selected

    @staticmethod
    def _query_terms(query: str) -> list[str]:
        tokens = re.findall(r"[^\W_]{2,}", normalize_text(query), flags=re.UNICODE)
        unique: list[str] = []
        for token in tokens:
            if token in STOP_WORDS or token.isdigit() or token in unique:
                continue
            unique.append(token)
        return unique

    @staticmethod
    def _parse_datetime(value: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return datetime.now(timezone.utc)

    @staticmethod
    def _decode_row(row: Any) -> dict[str, Any]:
        result = dict(row)
        result["tags"] = json.loads(result.pop("tags_json"))
        result["pinned"] = bool(result["pinned"])
        return result
