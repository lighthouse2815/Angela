from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Any, Iterator

from .config import Settings
from .llm import LLMError, LLMResponse, LLMStreamEvent, OpenAICompatibleLLM
from .memory import (
    MemoryStore,
    RetrievedMemory,
    contains_secret,
    explicitly_requests_memory,
)
from .prompts import build_companion_system_prompt
from .store import ConversationStore, ProfileStore


SIMPLE_GREETING_PATTERN = re.compile(
    r"(?:(?:xin\s+)?chào(?:\s+(?:bạn|cậu|angela))?|hello|hi|hey|alo)[!.,?\s]*",
    re.IGNORECASE,
)
MAX_USER_INPUT_TOKENS = 1_400
MAX_PROMPT_INPUT_TOKENS = 3_200


class ChatCancelled(RuntimeError):
    """Raised when the caller explicitly cancels a pending chat turn."""


def estimate_tokens(text: str) -> int:
    """Conservative tokenizer-free estimate that works well for UTF-8 Vietnamese."""
    return max(1, (len(text.encode("utf-8")) + 2) // 3)


def budget_messages(
    system_prompt: str, recent: list[dict[str, Any]]
) -> list[dict[str, str]]:
    history = [
        {"role": row["role"], "content": row["content"]}
        for row in recent
        if row["role"] in {"user", "assistant"}
    ]
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt}
    ]
    if not history:
        return messages

    used = estimate_tokens(system_prompt) + 4
    current = history[-1]
    current_cost = estimate_tokens(current["content"]) + 4
    if used + current_cost > MAX_PROMPT_INPUT_TOKENS:
        raise ValueError(
            "Tin nhắn quá dài cho context của bộ não local. Hãy chia nội dung thành vài tin ngắn hơn."
        )

    selected_turns_reversed: list[list[dict[str, str]]] = []
    used += current_cost
    index = len(history) - 2
    while index >= 1:
        user = history[index - 1]
        assistant = history[index]
        if user["role"] != "user" or assistant["role"] != "assistant":
            index -= 1
            continue
        turn = [user, assistant]
        cost = sum(estimate_tokens(item["content"]) + 4 for item in turn)
        if used + cost > MAX_PROMPT_INPUT_TOKENS:
            break
        selected_turns_reversed.append(turn)
        used += cost
        index -= 2
    for turn in reversed(selected_turns_reversed):
        messages.extend(turn)
    messages.append(current)
    return messages


def safe_greeting_reply(user_text: str) -> str:
    normalized = user_text.casefold().lstrip()
    if normalized.startswith(("hello", "hi", "hey")):
        return "Hello, mình ở đây. Bạn muốn bắt đầu bằng chuyện gì?"
    if normalized.startswith("alo"):
        return "Alo, mình đang nghe đây. Bạn muốn bắt đầu bằng chuyện gì?"
    return "Chào bạn, mình ở đây rồi. Bạn muốn bắt đầu bằng chuyện gì?"


@dataclass(slots=True)
class ChatResult:
    conversation_id: int
    user_message: dict[str, Any]
    assistant_message: dict[str, Any]
    recalled_memories: list[RetrievedMemory]
    llm_response: LLMResponse

    def as_dict(self) -> dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "user_message": self.user_message,
            "assistant_message": self.assistant_message,
            "recalled_memories": [memory.as_dict() for memory in self.recalled_memories],
            "model": self.llm_response.model,
            "usage": self.llm_response.usage,
        }


@dataclass(slots=True)
class PreparedChat:
    conversation_id: int
    clean_text: str
    user_message: dict[str, Any]
    recalled_memories: list[RetrievedMemory]
    messages: list[dict[str, str]]
    temperature: float
    max_tokens: int
    direct_response: LLMResponse | None = None


class CompanionService:
    def __init__(
        self,
        settings: Settings,
        profiles: ProfileStore,
        conversations: ConversationStore,
        memories: MemoryStore,
        llm: OpenAICompatibleLLM,
    ):
        self.settings = settings
        self.profiles = profiles
        self.conversations = conversations
        self.memories = memories
        self.llm = llm
        self._locks_guard = threading.Lock()
        self._conversation_locks: dict[int, threading.RLock] = {}

    def chat(self, conversation_id: int | None, user_text: str) -> ChatResult:
        conversation_id, clean_text = self._validate_and_resolve(
            conversation_id, user_text
        )
        with self._lock_for(conversation_id):
            prepared = self._prepare_locked(conversation_id, clean_text)
            committed = False
            try:
                response = prepared.direct_response or self.llm.complete(
                    prepared.messages,
                    temperature=prepared.temperature,
                    max_tokens=prepared.max_tokens,
                )
                result = self._finalize(prepared, response)
                committed = True
                return result
            finally:
                if not committed:
                    self._cleanup_user_message(prepared.user_message["id"])

    def stream_chat(
        self,
        conversation_id: int | None,
        user_text: str,
        *,
        cancel_event: threading.Event | None = None,
    ) -> Iterator[dict[str, Any]]:
        conversation_id, clean_text = self._validate_and_resolve(
            conversation_id, user_text
        )
        with self._lock_for(conversation_id):
            prepared: PreparedChat | None = None
            committed = False
            try:
                self._raise_if_cancelled(cancel_event)
                prepared = self._prepare_locked(conversation_id, clean_text)
                self._raise_if_cancelled(cancel_event)
                yield {
                    "type": "start",
                    "conversation_id": prepared.conversation_id,
                    "user_message": prepared.user_message,
                    "recalled_memories": [
                        memory.as_dict() for memory in prepared.recalled_memories
                    ],
                }
                self._raise_if_cancelled(cancel_event)

                if prepared.direct_response is not None:
                    yield {
                        "type": "delta",
                        "seq": 1,
                        "content": prepared.direct_response.content,
                    }
                    self._raise_if_cancelled(cancel_event)
                    result = self._finalize(prepared, prepared.direct_response)
                    committed = True
                    yield {
                        "type": "done",
                        **result.as_dict(),
                        "finish_reason": "stop",
                    }
                    return

                final_event: LLMStreamEvent | None = None
                sequence = 0
                llm_stream = self.llm.stream_complete(
                    prepared.messages,
                    temperature=prepared.temperature,
                    max_tokens=prepared.max_tokens,
                )
                try:
                    for event in llm_stream:
                        self._raise_if_cancelled(cancel_event)
                        if event.kind == "delta" and event.content:
                            sequence += 1
                            yield {
                                "type": "delta",
                                "seq": sequence,
                                "content": event.content,
                            }
                            self._raise_if_cancelled(cancel_event)
                        elif event.kind == "done":
                            final_event = event
                except Exception:
                    self._raise_if_cancelled(cancel_event)
                    raise
                finally:
                    close_stream = getattr(llm_stream, "close", None)
                    if close_stream is not None:
                        close_stream()

                self._raise_if_cancelled(cancel_event)
                if final_event is None:
                    raise LLMError("Stream LLM thiếu sự kiện hoàn tất")
                response = LLMResponse(
                    content=final_event.content,
                    model=final_event.model or self.settings.llm_model,
                    usage=final_event.usage,
                )
                result = self._finalize(prepared, response)
                committed = True
                yield {
                    "type": "done",
                    **result.as_dict(),
                    "finish_reason": final_event.finish_reason,
                }
            finally:
                if prepared is not None and not committed:
                    self._cleanup_user_message(prepared.user_message["id"])

    def _validate_and_resolve(
        self, conversation_id: int | None, user_text: str
    ) -> tuple[int, str]:
        clean_text = " ".join(user_text.strip().split())
        if not clean_text:
            raise ValueError("Tin nhắn không được để trống")
        if len(clean_text) > 12_000:
            raise ValueError("Tin nhắn quá dài, giới hạn là 12.000 ký tự")
        if estimate_tokens(clean_text) > MAX_USER_INPUT_TOKENS:
            raise ValueError(
                "Tin nhắn quá dài cho bộ não local. Hãy chia nội dung thành vài tin ngắn hơn."
            )
        if contains_secret(clean_text):
            raise ValueError(
                "Đừng gửi mật khẩu, OTP, API key, token hoặc cookie vào chat. "
                "Angela đã chặn tin này trước khi lưu và trước khi gọi LLM."
            )

        if conversation_id is None:
            conversation_id = self.conversations.latest_or_create()["id"]
        if not self.conversations.exists(conversation_id):
            raise ValueError("Cuộc trò chuyện không tồn tại")
        return conversation_id, clean_text

    def _prepare_locked(self, conversation_id: int, clean_text: str) -> PreparedChat:
        user_message = self.conversations.add_message(
            conversation_id, "user", clean_text
        )
        try:
            if SIMPLE_GREETING_PATTERN.fullmatch(clean_text):
                return PreparedChat(
                    conversation_id=conversation_id,
                    clean_text=clean_text,
                    user_message=user_message,
                    recalled_memories=[],
                    messages=[],
                    temperature=0.0,
                    max_tokens=0,
                    direct_response=LLMResponse(
                        content=safe_greeting_reply(clean_text),
                        model="angela-greeting-guard",
                        usage={"prompt_tokens": 0, "completion_tokens": 0},
                    ),
                )
            recalled = self.memories.retrieve(
                clean_text,
                limit=min(self.settings.memory_limit, 3),
                source_message_id=user_message["id"],
            )
            profile = self.profiles.get()
            recent = self.conversations.recent_messages(
                conversation_id, self.settings.context_messages
            )
            messages = budget_messages(
                build_companion_system_prompt(profile, recalled), recent
            )
            is_memory_instruction = explicitly_requests_memory(clean_text)
            is_direct_recall = bool(
                recalled
                and re.search(
                    r"\b(?:ngày\s+nào|khi\s+nào|bao\s+giờ|ở\s+đâu|là\s+gì|"
                    r"màu\s+gì|loại\s+gì|hoa\s+gì|uống[^?]{0,24}gì|thích[^?]{0,24}gì)\b",
                    clean_text.casefold(),
                )
            )
            if is_memory_instruction:
                messages[0]["content"] += (
                    "\n\nLượt hiện tại là yêu cầu ghi nhớ. Chỉ xác nhận điều sẽ nhớ trong 1-2 câu. "
                    "Không thêm ẩn dụ, P.S., lời mời, gợi ý mua sắm hoặc chi tiết chưa được nói."
                )
            elif is_direct_recall:
                messages[0]["content"] += (
                    "\n\nLượt hiện tại là tác vụ trích xuất ký ức, không phải sáng tác. "
                    "Chỉ trả lời dữ kiện có trong KÝ ỨC LIÊN QUAN bằng tối đa 2 câu. "
                    "Cấm thêm hình ảnh tưởng tượng, cảm xúc của người khác, gợi ý, lời mời, "
                    "P.S., emoji hoặc câu hỏi tiếp theo."
                )
            return PreparedChat(
                conversation_id=conversation_id,
                clean_text=clean_text,
                user_message=user_message,
                recalled_memories=recalled,
                messages=messages,
                temperature=(
                    0.42
                    if is_memory_instruction
                    else 0.2
                    if is_direct_recall
                    else 0.58
                    if recalled
                    else 0.66
                ),
                max_tokens=(
                    110
                    if is_memory_instruction
                    else 140
                    if is_direct_recall
                    else 300
                    if recalled
                    else 420
                ),
            )
        except Exception:
            self._cleanup_user_message(user_message["id"])
            raise

    def _finalize(self, prepared: PreparedChat, response: LLMResponse) -> ChatResult:
        assistant_message = self.conversations.add_message(
            prepared.conversation_id, "assistant", response.content
        )
        return ChatResult(
            conversation_id=prepared.conversation_id,
            user_message=prepared.user_message,
            assistant_message=assistant_message,
            recalled_memories=prepared.recalled_memories,
            llm_response=response,
        )

    def _lock_for(self, conversation_id: int) -> threading.RLock:
        with self._locks_guard:
            lock = self._conversation_locks.get(conversation_id)
            if lock is None:
                lock = threading.RLock()
                self._conversation_locks[conversation_id] = lock
            return lock

    @staticmethod
    def _raise_if_cancelled(cancel_event: threading.Event | None) -> None:
        if cancel_event is not None and cancel_event.is_set():
            raise ChatCancelled("Lượt trò chuyện đã được hủy")

    def _cleanup_user_message(self, message_id: int) -> None:
        try:
            self.conversations.delete_message(message_id)
        except Exception:
            pass
