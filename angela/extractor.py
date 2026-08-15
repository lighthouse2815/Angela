from __future__ import annotations

import re
from datetime import date
from typing import Any

from .llm import LLMError, OpenAICompatibleLLM
from .memory import (
    MEMORY_KINDS,
    MemoryStore,
    contains_secret,
    explicitly_requests_memory,
    forbids_memory,
    stable_slug,
)
from .prompts import MEMORY_EXTRACTION_SYSTEM_PROMPT


class MemoryExtractor:
    def __init__(self, llm: OpenAICompatibleLLM, memories: MemoryStore):
        self.llm = llm
        self.memories = memories

    def extract_and_store(
        self,
        *,
        source_message_id: int,
        user_text: str,
        assistant_text: str,
    ) -> list[dict[str, Any]]:
        if contains_secret(user_text) or forbids_memory(user_text):
            return []
        try:
            payload = self.llm.complete_json(
                [
                    {"role": "system", "content": MEMORY_EXTRACTION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Tin nhắn người dùng:\n"
                            f"{user_text}\n\n"
                            "Phản hồi của companion chỉ để hiểu ngữ cảnh, không xem là sự thật:\n"
                            f"{assistant_text}"
                        ),
                    },
                ],
                max_tokens=760,
            )
            candidates = payload.get("memories", [])
            extraction_origin = "llm_extracted"
        except LLMError:
            candidates = self._heuristic_candidates(user_text)
            extraction_origin = "heuristic_extracted"

        stored: list[dict[str, Any]] = []
        if not isinstance(candidates, list):
            return stored
        for item in candidates[:5]:
            if not isinstance(item, dict):
                continue
            content = str(item.get("content", "")).strip()
            if len(content) < 5 or contains_secret(content):
                continue
            kind = str(item.get("kind", "fact"))
            if kind not in MEMORY_KINDS:
                kind = "fact"
            result = self.memories.add(
                kind=kind,
                subject=stable_slug(str(item.get("subject", content[:60]))),
                content=content,
                tags=item.get("tags", []) if isinstance(item.get("tags", []), list) else [],
                event_at=item.get("event_at") or None,
                origin=extraction_origin,
                confidence=item.get("confidence", 0.8),
                importance=item.get("importance", 0.55),
                pinned=bool(item.get("pinned", False)),
                sensitivity=str(item.get("sensitivity", "normal")),
                source_message_id=source_message_id,
            )
            if result:
                stored.append(result)
        return stored

    def capture_explicit(
        self, *, source_message_id: int | None, user_text: str
    ) -> list[dict[str, Any]]:
        """Persist obvious user-stated memory before the slower background pass."""
        if contains_secret(user_text) or forbids_memory(user_text):
            return []
        stored: list[dict[str, Any]] = []
        for item in self._heuristic_candidates(user_text):
            result = self.memories.add(
                kind=str(item["kind"]),
                subject=str(item["subject"]),
                content=str(item["content"]),
                tags=item.get("tags", []),
                event_at=item.get("event_at") or None,
                origin="user_explicit",
                confidence=item.get("confidence", 0.62),
                importance=item.get("importance", 0.58),
                pinned=bool(item.get("pinned", False)),
                sensitivity=str(item.get("sensitivity", "normal")),
                source_message_id=source_message_id,
            )
            if result:
                stored.append(result)
        return stored

    @staticmethod
    def should_extract(user_text: str) -> bool:
        compact = " ".join(user_text.strip().split())
        if not compact or contains_secret(compact) or forbids_memory(compact):
            return False
        lower = compact.casefold()
        explicit = explicitly_requests_memory(compact)
        if "?" in compact and not explicit:
            return False
        return explicit or bool(
            re.search(
                r"\b(?:tôi|mình)\s+(?:thích|ghét|muốn|định|sẽ|đã|vừa|sống|ở|làm việc|có)\b",
                lower,
            )
            or re.search(
                r"\b(?:hôm nay|hôm qua|tuần trước|tháng trước|năm ngoái|sinh nhật)\b",
                lower,
            )
        )

    @staticmethod
    def _heuristic_candidates(text: str) -> list[dict[str, Any]]:
        """Small offline safety net. The LLM extractor remains the primary path."""
        compact = " ".join(text.strip().split())
        if not compact or len(compact) > 700:
            return []
        lower = compact.casefold()
        explicit = explicitly_requests_memory(compact)
        if "?" in compact and not explicit:
            return []
        preference = bool(
            re.search(r"\b(?:tôi|mình)\s+(?:rất\s+)?(?:thích|ghét|không thích)\b", lower)
            or re.search(
                r"\b(?:màu|món|đồ\s+uống|bài\s+hát|phim|sách)\s+"
                r"(?:yêu\s+thích|ưa\s+thích)\s+của\s+(?:tôi|mình)\s+là\b",
                lower,
            )
        )
        goal = bool(re.search(r"\b(?:tôi|mình)\s+(?:muốn|định|sẽ)\b", lower))
        fact = bool(
            re.search(
                r"\b(?:tôi|mình)\s+(?:là|ở|sống|làm việc|sinh ngày|có)\b", lower
            )
        )
        event = bool(
            re.search(
                r"\b(?:hôm nay|hôm qua|tuần trước|tháng trước|năm ngoái|vừa|đã|sinh nhật)\b",
                lower,
            )
        )
        if not any((explicit, preference, goal, fact, event)):
            return []
        cleaned = re.sub(
            r"^(?:hãy\s+)?nhớ\s+(?:rằng\s+)?", "", compact, flags=re.I
        )
        clauses = [cleaned]
        if explicit:
            split_clauses = [part.strip(" ,.;") for part in re.split(r"\s+và\s+", cleaned, maxsplit=3, flags=re.I)]
            if len(split_clauses) > 1 and all(len(part) >= 7 for part in split_clauses):
                clauses = split_clauses

        candidates: list[dict[str, Any]] = []
        for clause in clauses:
            clause_lower = clause.casefold()
            clause_preference = bool(
                re.search(r"\b(?:thích|ghét|không thích|thường mua|thường dùng)\b", clause_lower)
                or re.search(r"\b(?:yêu\s+thích|ưa\s+thích)\s+của\s+(?:tôi|mình)\s+là\b", clause_lower)
            )
            clause_goal = bool(re.search(r"\b(?:muốn|định|sẽ)\b", clause_lower))
            clause_event = bool(
                re.search(
                    r"\b(?:hôm nay|hôm qua|tuần trước|tháng trước|năm ngoái|vừa|đã|sinh nhật)\b",
                    clause_lower,
                )
            )
            kind = (
                "preference"
                if clause_preference
                else "goal"
                if clause_goal
                else "event"
                if clause_event
                else "fact"
            )
            subject = MemoryExtractor._heuristic_subject(clause, kind)
            candidates.append(
                {
                    "kind": kind,
                    "subject": subject,
                    "content": clause,
                    "tags": [],
                    "event_at": MemoryExtractor._heuristic_event_at(clause),
                    "confidence": 0.68 if explicit else 0.6,
                    "importance": 0.9 if explicit else 0.58,
                    "pinned": explicit,
                    "sensitivity": "normal",
                }
            )
        return candidates

    @staticmethod
    def _heuristic_subject(clause: str, kind: str) -> str:
        lower = clause.casefold()
        if "sinh nhật" in lower:
            relationship = next(
                (
                    key
                    for word, key in (
                        ("mẹ", "me"),
                        ("má", "me"),
                        ("bố", "bo"),
                        ("ba", "bo"),
                        ("anh trai", "anh_trai"),
                        ("chị gái", "chi_gai"),
                    )
                    if re.search(rf"\b{re.escape(word)}\b", lower)
                ),
                "nguoi_than",
            )
            return f"sinh_nhat_{relationship}"
        if re.search(r"\b(?:sống|ở|chuyển đến|chuyển vào)\b", lower):
            return "noi_o_hien_tai"
        if re.search(r"\b(?:làm việc|công việc|nghề)\b", lower):
            return "cong_viec_hien_tai"
        if re.search(r"\b(?:thường mua|mua).*\b(?:mẹ|má)\b", lower):
            return "qua_thuong_mua_cho_me"
        if kind == "preference":
            if re.search(r"\bmàu\b", lower):
                return "mau_yeu_thich"
        prefix = {
            "preference": "so_thich",
            "goal": "muc_tieu",
            "event": "su_kien",
            "fact": "thong_tin",
        }.get(kind, "memory")
        return f"{prefix}_{stable_slug(clause, 42)}"

    @staticmethod
    def _heuristic_event_at(clause: str) -> str | None:
        lower = clause.casefold()
        match = re.search(
            r"\bngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?\b",
            lower,
        )
        if not match:
            match = re.search(
                r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b", lower
            )
        if not match:
            return None
        day, month, year = match.groups()
        day_number = int(day)
        month_number = int(month)
        try:
            date(int(year) if year else 2000, month_number, day_number)
        except ValueError:
            return None
        if year:
            return f"{year}-{month_number:02d}-{day_number:02d}"
        return f"--{month_number:02d}-{day_number:02d}"
