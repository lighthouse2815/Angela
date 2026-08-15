from __future__ import annotations

import hashlib
import json
import threading
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from .database import Database
from .llm import OpenAICompatibleLLM
from .prompts import REFLECTION_SYSTEM_PROMPT
from .store import ProfileStore


ALLOWED_FIELDS = {
    "warmth",
    "humor",
    "directness",
    "initiative",
    "response_length",
    "topics_to_avoid",
}
NUMERIC_FIELDS = {"warmth", "humor", "directness", "initiative"}

MIN_FEEDBACK = 8
MIN_NEGATIVE_FEEDBACK = 3
MAX_FEEDBACK_BATCH = 10
MIN_FEEDBACK_SPAN = timedelta(minutes=30)
MIN_EVIDENCE_ITEMS = 3
MIN_NEGATIVE_EVIDENCE = 2
MIN_EVIDENCE_SPAN = timedelta(minutes=15)
REFLECTION_COOLDOWN = timedelta(hours=24)
FAILED_RETRY_DELAY = timedelta(minutes=15)
STALE_RUN_AFTER = timedelta(minutes=30)
REJECTED_DEDUPE_WINDOW = timedelta(days=30)


class GrowthService:
    def __init__(
        self,
        database: Database,
        profiles: ProfileStore,
        llm: OpenAICompatibleLLM,
        now_provider: Callable[[], datetime] | None = None,
    ):
        self.database = database
        self.profiles = profiles
        self.llm = llm
        self._now_provider = now_provider or (lambda: datetime.now(timezone.utc))
        self._lock = threading.RLock()
        self._recover_stale_runs()

    def status(self) -> dict[str, Any]:
        now = self._now()
        with self.database.connect() as connection:
            stats = connection.execute(
                """
                SELECT
                    COUNT(*) AS feedback_count,
                    COALESCE(SUM(CASE WHEN f.score = -1 THEN 1 ELSE 0 END), 0)
                        AS negative_count,
                    COUNT(DISTINCT m.conversation_id) AS conversation_count,
                    MIN(f.created_at) AS first_feedback_at,
                    MAX(f.created_at) AS last_feedback_at
                FROM feedback f
                JOIN messages m ON m.id = f.message_id
                WHERE f.reflected_at IS NULL
                """
            ).fetchone()
            running = connection.execute(
                """
                SELECT * FROM growth_reflection_runs
                WHERE status = 'running' ORDER BY id DESC LIMIT 1
                """
            ).fetchone()
            last_run = connection.execute(
                "SELECT * FROM growth_reflection_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
            last_completed = connection.execute(
                """
                SELECT * FROM growth_reflection_runs
                WHERE status = 'completed' ORDER BY id DESC LIMIT 1
                """
            ).fetchone()
            pending_count = int(
                connection.execute(
                    """
                    SELECT COUNT(*) AS n FROM growth_proposals
                    WHERE status = 'pending'
                    """
                ).fetchone()["n"]
            )

        feedback_count = int(stats["feedback_count"])
        negative_count = int(stats["negative_count"])
        conversation_count = int(stats["conversation_count"])
        span_seconds = self._span_seconds(
            stats["first_feedback_at"], stats["last_feedback_at"]
        )
        diversity_met = (
            conversation_count >= 2
            or span_seconds >= int(MIN_FEEDBACK_SPAN.total_seconds())
        )

        cooldown_until: datetime | None = None
        if last_completed is not None and last_completed["completed_at"]:
            cooldown_until = self._parse_datetime(last_completed["completed_at"]) + (
                REFLECTION_COOLDOWN
            )

        retry_after: datetime | None = None
        if (
            last_run is not None
            and last_run["status"] == "failed"
            and last_run["retry_after"]
        ):
            retry_after = self._parse_datetime(last_run["retry_after"])

        if running is not None:
            state = "running"
        elif feedback_count < MIN_FEEDBACK:
            state = "waiting_feedback"
        elif negative_count < MIN_NEGATIVE_FEEDBACK:
            state = "waiting_negative_feedback"
        elif not diversity_met:
            state = "waiting_diversity"
        elif cooldown_until is not None and cooldown_until > now:
            state = "cooldown"
        elif retry_after is not None and retry_after > now:
            state = "retry_wait"
        else:
            state = "ready"

        next_eligible_at: str | None = None
        future_limits = [
            item
            for item in (cooldown_until, retry_after)
            if item is not None and item > now
        ]
        if future_limits:
            next_eligible_at = self._iso(max(future_limits))

        return {
            "state": state,
            "eligible": state == "ready",
            "unreflected_count": feedback_count,
            "negative_count": negative_count,
            "conversation_count": conversation_count,
            "feedback_span_seconds": span_seconds,
            "required_feedback": MIN_FEEDBACK,
            "required_negative_feedback": MIN_NEGATIVE_FEEDBACK,
            "diversity_met": diversity_met,
            "pending_count": pending_count,
            "last_run_at": self._last_run_at(last_run),
            "next_eligible_at": next_eligible_at,
        }

    def analyze(self, trigger: str = "manual") -> list[dict[str, Any]]:
        """Reflect once if the evidence gate is open; never apply a proposal."""

        with self._lock:
            if not self.status()["eligible"]:
                return []
            batch = self._load_feedback_batch()
            if len(batch) < MIN_FEEDBACK:
                return []
            return self._run_reflection(batch, trigger=trigger)

    def list(self, status: str | None = None) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            if status:
                rows = connection.execute(
                    """
                    SELECT * FROM growth_proposals
                    WHERE status = ? ORDER BY id DESC LIMIT 100
                    """,
                    (status,),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM growth_proposals ORDER BY id DESC LIMIT 100"
                ).fetchall()
        return [self._decode(row) for row in rows]

    def apply(self, proposal_id: int) -> dict[str, Any]:
        """Apply only an explicitly selected pending proposal, atomically."""

        with self._lock:
            now = self._iso(self._now())
            stale_error: str | None = None
            applied_profile: dict[str, Any] | None = None
            proposal: dict[str, Any] | None = None
            with self.database.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    """
                    SELECT * FROM growth_proposals
                    WHERE id = ? AND status = 'pending'
                    """,
                    (proposal_id,),
                ).fetchone()
                if row is None:
                    raise ValueError("Đề xuất không tồn tại hoặc đã được xử lý")
                proposal = self._decode(row)
                value = self._validate_value(
                    proposal["field"], proposal["proposed_value"]
                )
                profile_row = connection.execute(
                    "SELECT persona_json FROM profiles WHERE id = 1"
                ).fetchone()
                if profile_row is None:
                    raise ValueError("Profile chưa được khởi tạo")
                persona = json.loads(profile_row["persona_json"])
                current_value = persona.get(proposal["field"])
                base_value = proposal.get("base_value")
                if base_value is not None and current_value != base_value:
                    stale_error = "Đề xuất đã cũ vì phong cách hiện tại đã thay đổi"
                elif current_value == value:
                    stale_error = "Đề xuất không còn tạo ra thay đổi"

                if stale_error:
                    connection.execute(
                        """
                        UPDATE growth_proposals
                        SET status = 'stale', reviewed_at = ?
                        WHERE id = ? AND status = 'pending'
                        """,
                        (now, proposal_id),
                    )
                else:
                    applied_profile = (
                        self.profiles.update_persona_field_in_transaction(
                            connection,
                            proposal["field"],
                            value,
                            f"Áp dụng proposal #{proposal_id}: {proposal['title']}",
                            now,
                        )
                    )
                    cursor = connection.execute(
                        """
                        UPDATE growth_proposals
                        SET status = 'applied', reviewed_at = ?
                        WHERE id = ? AND status = 'pending'
                        """,
                        (now, proposal_id),
                    )
                    if cursor.rowcount != 1:
                        raise ValueError("Đề xuất đã được xử lý đồng thời")

            if stale_error:
                raise ValueError(stale_error)
            assert proposal is not None and applied_profile is not None
            return {
                "proposal": {**proposal, "status": "applied", "reviewed_at": now},
                "profile": applied_profile,
            }

    def reject(self, proposal_id: int) -> dict[str, Any]:
        with self._lock:
            now = self._iso(self._now())
            with self.database.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    """
                    SELECT * FROM growth_proposals
                    WHERE id = ? AND status = 'pending'
                    """,
                    (proposal_id,),
                ).fetchone()
                if row is None:
                    raise ValueError("Đề xuất không tồn tại hoặc đã được xử lý")
                cursor = connection.execute(
                    """
                    UPDATE growth_proposals
                    SET status = 'rejected', reviewed_at = ?
                    WHERE id = ? AND status = 'pending'
                    """,
                    (now, proposal_id),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Đề xuất đã được xử lý đồng thời")
            result = self._decode(row)
            result["status"] = "rejected"
            result["reviewed_at"] = now
            return result

    def _run_reflection(
        self, batch: list[dict[str, Any]], *, trigger: str
    ) -> list[dict[str, Any]]:
        now = self._now()
        fingerprint = self._batch_fingerprint(batch)
        run_id = self._claim_run(batch, fingerprint, trigger, now)
        if run_id is None:
            return []

        profile = self.profiles.get()
        try:
            payload = self.llm.complete_json(
                [
                    {"role": "system", "content": REFLECTION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "current_persona": profile["persona"],
                                "feedback": [self._feedback_payload(item) for item in batch],
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
                max_tokens=600,
            )
        except Exception as exc:
            self._mark_run_failed(run_id, exc, self._now())
            raise

        candidate = self._prepare_candidate(payload, batch, profile["persona"])
        completed_at = self._iso(self._now())
        created: list[dict[str, Any]] = []
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            batch_unchanged = self._batch_is_unchanged(connection, batch)
            if candidate is not None and batch_unchanged:
                profile_row = connection.execute(
                    "SELECT persona_json FROM profiles WHERE id = 1"
                ).fetchone()
                current_persona = json.loads(profile_row["persona_json"])
                if current_persona.get(candidate["field"]) == candidate["base_value"]:
                    if not self._proposal_is_duplicate(
                        connection,
                        candidate["field"],
                        candidate["value"],
                        self._now(),
                    ):
                        cursor = connection.execute(
                            """
                            INSERT INTO growth_proposals (
                                field, proposed_value_json, title, rationale,
                                evidence_json, risk, status, created_at,
                                reflection_run_id, base_value_json
                            ) VALUES (?, ?, ?, ?, ?, 'low', 'pending', ?, ?, ?)
                            """,
                            (
                                candidate["field"],
                                json.dumps(candidate["value"], ensure_ascii=False),
                                candidate["title"],
                                candidate["rationale"],
                                json.dumps(
                                    candidate["evidence_message_ids"],
                                    ensure_ascii=False,
                                ),
                                completed_at,
                                run_id,
                                json.dumps(
                                    candidate["base_value"], ensure_ascii=False
                                ),
                            ),
                        )
                        row = connection.execute(
                            "SELECT * FROM growth_proposals WHERE id = ?",
                            (cursor.lastrowid,),
                        ).fetchone()
                        created.append(self._decode(row))

            for item in batch:
                connection.execute(
                    """
                    UPDATE feedback SET reflected_at = ?
                    WHERE message_id = ? AND created_at = ? AND score = ?
                      AND COALESCE(note, '') = ? AND reflected_at IS NULL
                    """,
                    (
                        completed_at,
                        item["message_id"],
                        item["created_at"],
                        item["score"],
                        item["note"],
                    ),
                )
            connection.execute(
                """
                UPDATE growth_reflection_runs
                SET status = 'completed', completed_at = ?, retry_after = NULL,
                    error = NULL
                WHERE id = ?
                """,
                (completed_at, run_id),
            )
        return created

    def _claim_run(
        self,
        batch: list[dict[str, Any]],
        fingerprint: str,
        trigger: str,
        now: datetime,
    ) -> int | None:
        now_text = self._iso(now)
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT * FROM growth_reflection_runs
                WHERE batch_fingerprint = ?
                """,
                (fingerprint,),
            ).fetchone()
            if existing is not None:
                if existing["status"] in {"running", "completed"}:
                    return None
                if existing["retry_after"] and (
                    self._parse_datetime(existing["retry_after"]) > now
                ):
                    return None
                connection.execute(
                    """
                    UPDATE growth_reflection_runs
                    SET trigger = ?, status = 'running', started_at = ?,
                        completed_at = NULL, retry_after = NULL, error = NULL,
                        attempt_count = attempt_count + 1
                    WHERE id = ?
                    """,
                    (trigger[:40], now_text, existing["id"]),
                )
                return int(existing["id"])

            cursor = connection.execute(
                """
                INSERT INTO growth_reflection_runs (
                    trigger, status, batch_fingerprint, feedback_ids_json,
                    feedback_count, negative_count, conversation_count,
                    started_at
                ) VALUES (?, 'running', ?, ?, ?, ?, ?, ?)
                """,
                (
                    trigger[:40],
                    fingerprint,
                    json.dumps([item["message_id"] for item in batch]),
                    len(batch),
                    sum(1 for item in batch if item["score"] == -1),
                    len({item["conversation_id"] for item in batch}),
                    now_text,
                ),
            )
            return int(cursor.lastrowid)

    def _mark_run_failed(
        self, run_id: int, error: Exception, attempted_at: datetime
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                UPDATE growth_reflection_runs
                SET status = 'failed', completed_at = ?, retry_after = ?, error = ?
                WHERE id = ?
                """,
                (
                    self._iso(attempted_at),
                    self._iso(attempted_at + FAILED_RETRY_DELAY),
                    str(error)[:1000],
                    run_id,
                ),
            )

    def _load_feedback_batch(self) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    f.message_id,
                    f.score,
                    COALESCE(f.note, '') AS note,
                    f.created_at,
                    m.conversation_id,
                    m.content AS assistant_message,
                    COALESCE(
                        (
                            SELECT prior.content
                            FROM messages prior
                            WHERE prior.conversation_id = m.conversation_id
                              AND prior.role = 'user'
                              AND prior.id < m.id
                            ORDER BY prior.id DESC LIMIT 1
                        ),
                        ''
                    ) AS user_message
                FROM feedback f
                JOIN messages m ON m.id = f.message_id
                WHERE f.reflected_at IS NULL
                ORDER BY
                    CASE WHEN f.score = -1 THEN 0 ELSE 1 END,
                    f.created_at DESC,
                    f.message_id DESC
                LIMIT ?
                """,
                (MAX_FEEDBACK_BATCH,),
            ).fetchall()
        return [dict(row) for row in rows]

    def _prepare_candidate(
        self,
        payload: Any,
        batch: list[dict[str, Any]],
        persona: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not isinstance(payload, dict):
            return None
        proposals = payload.get("proposals")
        if not isinstance(proposals, list) or not proposals:
            return None
        proposal = proposals[0]
        if not isinstance(proposal, dict):
            return None

        field = str(proposal.get("field", "")).strip()
        try:
            value = self._validate_value(field, proposal.get("value"))
        except ValueError:
            return None
        if field not in persona:
            return None
        base_value = persona[field]
        if value == base_value:
            return None

        raw_evidence = proposal.get(
            "evidence_message_ids", proposal.get("evidence", [])
        )
        evidence_ids = self._validated_evidence_ids(raw_evidence, batch)
        if evidence_ids is None:
            return None
        evidence_rows = {
            int(item["message_id"]): item for item in batch
        }
        selected_evidence = [evidence_rows[item] for item in evidence_ids]
        if not self._change_is_small_and_supported(
            field, base_value, value, selected_evidence
        ):
            return None

        rationale = str(proposal.get("rationale", "")).strip()[:1200]
        if not rationale:
            return None
        title = str(proposal.get("title", "Đề xuất điều chỉnh")).strip()[:120]
        return {
            "field": field,
            "value": value,
            "base_value": base_value,
            "title": title or "Đề xuất điều chỉnh",
            "rationale": rationale,
            "evidence_message_ids": evidence_ids,
        }

    def _validated_evidence_ids(
        self, raw_evidence: Any, batch: list[dict[str, Any]]
    ) -> list[int] | None:
        if not isinstance(raw_evidence, list):
            return None
        available = {int(item["message_id"]): item for item in batch}
        evidence_ids: list[int] = []
        for raw in raw_evidence:
            if isinstance(raw, bool):
                continue
            try:
                message_id = int(raw)
            except (TypeError, ValueError):
                continue
            if message_id in available and message_id not in evidence_ids:
                evidence_ids.append(message_id)
        if len(evidence_ids) < MIN_EVIDENCE_ITEMS:
            return None
        rows = [available[item] for item in evidence_ids]
        if sum(1 for item in rows if item["score"] == -1) < MIN_NEGATIVE_EVIDENCE:
            return None
        conversation_count = len({item["conversation_id"] for item in rows})
        timestamps = [self._parse_datetime(item["created_at"]) for item in rows]
        evidence_span = max(timestamps) - min(timestamps)
        if conversation_count < 2 and evidence_span < MIN_EVIDENCE_SPAN:
            return None
        return evidence_ids[:8]

    def _change_is_small_and_supported(
        self,
        field: str,
        current: Any,
        proposed: Any,
        evidence: list[dict[str, Any]],
    ) -> bool:
        if field in NUMERIC_FIELDS:
            return isinstance(current, int) and abs(proposed - current) == 1
        if field == "response_length":
            order = ["short", "balanced", "detailed"]
            if current not in order:
                return False
            return abs(order.index(proposed) - order.index(current)) == 1

        if not isinstance(current, list) or not isinstance(proposed, list):
            return False
        current_normalized = {str(item).strip().casefold() for item in current}
        proposed_normalized = {str(item).strip().casefold() for item in proposed}
        additions = proposed_normalized - current_normalized
        if current_normalized - proposed_normalized or len(additions) != 1:
            return False
        if len(proposed_normalized) != len(current_normalized) + 1:
            return False
        new_topic = next(iter(additions))
        supporting_notes = sum(
            1
            for item in evidence
            if new_topic and new_topic in str(item.get("note", "")).casefold()
        )
        return supporting_notes >= 2

    def _proposal_is_duplicate(
        self,
        connection: Any,
        field: str,
        value: Any,
        now: datetime,
    ) -> bool:
        if connection.execute(
            """
            SELECT 1 FROM growth_proposals
            WHERE field = ? AND status = 'pending' LIMIT 1
            """,
            (field,),
        ).fetchone():
            return True
        cutoff = now - REJECTED_DEDUPE_WINDOW
        rows = connection.execute(
            """
            SELECT proposed_value_json, COALESCE(reviewed_at, created_at) AS decided_at
            FROM growth_proposals
            WHERE field = ? AND status = 'rejected'
            ORDER BY id DESC LIMIT 100
            """,
            (field,),
        ).fetchall()
        for row in rows:
            if self._parse_datetime(row["decided_at"]) < cutoff:
                continue
            try:
                if json.loads(row["proposed_value_json"]) == value:
                    return True
            except json.JSONDecodeError:
                continue
        return False

    @staticmethod
    def _batch_is_unchanged(connection: Any, batch: list[dict[str, Any]]) -> bool:
        for item in batch:
            row = connection.execute(
                """
                SELECT score, COALESCE(note, '') AS note, created_at, reflected_at
                FROM feedback WHERE message_id = ?
                """,
                (item["message_id"],),
            ).fetchone()
            if row is None or row["reflected_at"] is not None:
                return False
            if (
                row["score"] != item["score"]
                or row["note"] != item["note"]
                or row["created_at"] != item["created_at"]
            ):
                return False
        return True

    def _recover_stale_runs(self) -> None:
        now = self._now()
        cutoff = self._iso(now - STALE_RUN_AFTER)
        with self.database.connect() as connection:
            connection.execute(
                """
                UPDATE growth_reflection_runs
                SET status = 'failed', completed_at = ?, retry_after = ?,
                    error = 'Reflection bị gián đoạn trước khi hoàn tất'
                WHERE status = 'running' AND started_at < ?
                """,
                (
                    self._iso(now),
                    self._iso(now + FAILED_RETRY_DELAY),
                    cutoff,
                ),
            )

    @staticmethod
    def _validate_value(field: str, value: Any) -> Any:
        if field not in ALLOWED_FIELDS:
            raise ValueError("Field tiến hóa không được phép")
        if field in NUMERIC_FIELDS:
            if isinstance(value, bool):
                raise ValueError("Giá trị phải là số")
            try:
                number = int(value)
            except (TypeError, ValueError) as exc:
                raise ValueError("Giá trị phải là số") from exc
            if not 0 <= number <= 10:
                raise ValueError("Giá trị phải nằm trong khoảng 0-10")
            return number
        if field == "response_length":
            if value not in {"short", "balanced", "detailed"}:
                raise ValueError("Độ dài phản hồi không hợp lệ")
            return value
        if not isinstance(value, list) or any(
            not isinstance(item, str) for item in value
        ):
            raise ValueError("topics_to_avoid phải là mảng chuỗi")
        return [item.strip()[:80] for item in value if item.strip()][:20]

    @staticmethod
    def _decode(row: Any) -> dict[str, Any]:
        result = dict(row)
        result["proposed_value"] = json.loads(result.pop("proposed_value_json"))
        result["evidence"] = json.loads(result.pop("evidence_json"))
        base_value_json = result.pop("base_value_json", None)
        result["base_value"] = (
            json.loads(base_value_json) if base_value_json is not None else None
        )
        return result

    @staticmethod
    def _feedback_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "message_id": item["message_id"],
            "conversation_id": item["conversation_id"],
            "user_message": str(item["user_message"])[:240],
            "assistant_message": str(item["assistant_message"])[:400],
            "score": item["score"],
            "note": str(item["note"])[:200],
            "created_at": item["created_at"],
        }

    @staticmethod
    def _batch_fingerprint(batch: list[dict[str, Any]]) -> str:
        evidence = [
            {
                "message_id": item["message_id"],
                "score": item["score"],
                "note": item["note"],
                "created_at": item["created_at"],
            }
            for item in sorted(batch, key=lambda item: int(item["message_id"]))
        ]
        encoded = json.dumps(
            evidence, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _now(self) -> datetime:
        value = self._now_provider()
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat(timespec="seconds")

    @staticmethod
    def _parse_datetime(value: str) -> datetime:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _span_seconds(self, first: str | None, last: str | None) -> int:
        if not first or not last:
            return 0
        return max(0, int((self._parse_datetime(last) - self._parse_datetime(first)).total_seconds()))

    @staticmethod
    def _last_run_at(row: Any) -> str | None:
        if row is None:
            return None
        return row["completed_at"] or row["started_at"]
