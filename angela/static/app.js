"use strict";

const VoiceCore = window.AngelaVoiceCore;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  profile: null,
  conversation: null,
  conversations: [],
  messages: [],
  memories: [],
  proposals: [],
  growthStatus: null,
  recalledMemories: [],
  llm: { available: false },
  sending: false,
  pendingVoiceMessage: null,
  voice: {
    capabilities: {
      recognition: Boolean(SpeechRecognition),
      synthesis: Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance),
      streaming: Boolean(window.ReadableStream && window.TextDecoder),
    },
    outputEnabled:
      localStorage.getItem("angela.voice") === "on" &&
      Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance),
    recognition: "idle",
    request: "idle",
    speech: "idle",
    recognitionSessionId: 0,
    epoch: 0,
    requestId: null,
    speechGeneration: 0,
    abortController: null,
    autoSendCommitted: false,
    draftBeforeListening: "",
    finalTranscript: "",
    interimTranscript: "",
    requestSource: "typed",
    assistantDraftId: null,
    temporaryUserId: null,
    streamText: "",
    sentenceBuffer: "",
    speechSuppressedEpoch: null,
    speechQueue: [],
    currentUtterance: null,
    selectedVoice: null,
    error: null,
  },
};

const elements = {
  brandName: document.querySelector("#brand-name"),
  chatTitle: document.querySelector("#chat-title"),
  chatSubtitle: document.querySelector("#chat-subtitle"),
  messages: document.querySelector("#messages"),
  composer: document.querySelector("#composer"),
  input: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  newChatButton: document.querySelector("#new-chat-button"),
  newChatMobile: document.querySelector("#new-chat-mobile"),
  conversationList: document.querySelector("#conversation-list"),
  memoryCount: document.querySelector("#memory-count"),
  proposalCount: document.querySelector("#proposal-count"),
  memoryList: document.querySelector("#memory-list"),
  memoryForm: document.querySelector("#memory-form"),
  memoryContent: document.querySelector("#memory-content"),
  memoryKind: document.querySelector("#memory-kind"),
  proposalList: document.querySelector("#proposal-list"),
  growthStatus: document.querySelector("#growth-status"),
  analyzeGrowth: document.querySelector("#analyze-growth"),
  recalledList: document.querySelector("#recalled-list"),
  modelDot: document.querySelector("#model-dot"),
  modelLabel: document.querySelector("#model-label"),
  modelWarning: document.querySelector("#model-warning"),
  voiceToggle: document.querySelector("#voice-toggle"),
  voiceToggleMobile: document.querySelector("#voice-toggle-mobile"),
  voiceStatus: document.querySelector("#voice-status"),
  listenButton: document.querySelector("#listen-button"),
  stopResponse: document.querySelector("#stop-response"),
  settingsForm: document.querySelector("#settings-form"),
  userName: document.querySelector("#user-name"),
  companionName: document.querySelector("#companion-name"),
  toast: document.querySelector("#toast"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Yêu cầu thất bại (${response.status})`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displaySubject(value) {
  const known = {
    sinh_nhat_me: "Sinh nhật mẹ",
    sinh_nhat_bo: "Sinh nhật bố",
    qua_thuong_mua_cho_me: "Quà thường mua cho mẹ",
    noi_o_hien_tai: "Nơi ở hiện tại",
    cong_viec_hien_tai: "Công việc hiện tại",
  };
  if (known[value]) return known[value];
  const text = String(value || "ký ức").replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Ký ức";
}

function displayKind(value) {
  return (
    {
      fact: "sự thật",
      preference: "sở thích",
      event: "sự kiện",
      relationship: "mối quan hệ",
      goal: "mục tiêu",
      boundary: "ranh giới",
      commitment: "cam kết",
      reflection: "chiêm nghiệm",
    }[value] || value
  );
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function applyBootstrap(payload) {
  state.profile = payload.profile;
  state.conversation = payload.conversation;
  state.conversations = payload.conversations || [];
  state.messages = payload.messages || [];
  state.memories = payload.memories || [];
  state.proposals = payload.growth_proposals || [];
  state.growthStatus = payload.growth_status || state.growthStatus;
  state.llm = payload.llm || { available: false };
  renderAll();
}

function renderAll() {
  const companionName = state.profile?.companion_name || "Angela";
  elements.brandName.textContent = companionName;
  elements.chatTitle.textContent = companionName;
  elements.chatSubtitle.textContent = state.llm.available
    ? "Ở đây, và có nhớ."
    : "Đang chờ bộ não local kết nối.";
  elements.userName.value = state.profile?.user_name || "Bạn";
  elements.companionName.value = companionName;
  document.title = companionName;
  renderModelState();
  renderConversations();
  renderMessages();
  renderMemories();
  renderProposals();
  renderGrowthStatus();
  renderRecalled();
  renderVoiceState();
}

function renderModelState() {
  const online = Boolean(state.llm?.available);
  elements.modelDot.classList.toggle("is-online", online);
  elements.modelDot.classList.toggle("is-offline", !online);
  elements.modelLabel.textContent = online
    ? `Đã nối ${state.llm.configured_model || "LLM"}`
    : "Mô hình đang ngoại tuyến";
  elements.modelWarning.hidden = online;
}

function renderConversations() {
  elements.conversationList.innerHTML = state.conversations
    .map(
      (conversation) => `
        <button
          type="button"
          class="conversation-button ${conversation.id === state.conversation?.id ? "is-active" : ""}"
          data-conversation-id="${conversation.id}"
          title="${escapeHtml(conversation.title)}"
        >${escapeHtml(conversation.title)}</button>
      `,
    )
    .join("");
}

function renderMessages() {
  if (!state.messages.length && !state.sending) {
    const name = escapeHtml(state.profile?.companion_name || "Angela");
    elements.messages.innerHTML = `
      <div class="empty-chat">
        <div class="monogram" aria-hidden="true">A</div>
        <h2>Chào, mình là ${name}.</h2>
        <p>Kể mình nghe một điều bạn muốn mình nhớ lâu. Lần sau mình sẽ nối tiếp từ đó.</p>
      </div>
    `;
    return;
  }

  const messages = state.messages
    .map((message) => {
      const isAssistant = message.role === "assistant";
      const isStreaming = Boolean(message.streaming);
      const feedback = message.feedback_score;
      return `
        <article
          class="message ${isAssistant ? "assistant" : "user"} ${isStreaming ? "is-streaming" : ""}"
          data-message-id="${escapeHtml(message.id)}"
          ${isStreaming ? `data-stream-epoch="${message.streamEpoch}"` : ""}
        >
          ${isAssistant ? '<div class="message-avatar" aria-hidden="true">A</div>' : ""}
          <div class="message-body">
            <div class="message-content">${escapeHtml(message.content)}</div>
            ${
              isAssistant && !isStreaming
                ? `<div class="message-meta">
                    <button class="feedback-button ${feedback === 1 ? "is-selected" : ""}" type="button" data-feedback="1" data-message-id="${message.id}">Hợp ý</button>
                    <button class="feedback-button ${feedback === -1 ? "is-selected" : ""}" type="button" data-feedback="-1" data-message-id="${message.id}">Chưa ổn</button>
                  </div>`
                : ""
            }
            ${
              isAssistant && !isStreaming && feedback === -1
                ? `<div class="feedback-note-row">
                    <label class="sr-only" for="feedback-note-${message.id}">Điều gì chưa ổn?</label>
                    <input
                      id="feedback-note-${message.id}"
                      data-feedback-note-input
                      maxlength="500"
                      value="${escapeHtml(message.feedback_note || "")}"
                      placeholder="Điều gì chưa ổn? (không bắt buộc)"
                    >
                    <button class="secondary-button" type="button" data-save-feedback-note data-message-id="${message.id}">Lưu lý do</button>
                  </div>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
  const hasStreamingDraft = state.messages.some((message) => message.streaming);
  const thinking = state.sending && !hasStreamingDraft
    ? `<div class="thinking-block" aria-label="Angela đang nghĩ">
        <div class="message-avatar" aria-hidden="true">A</div>
        <div class="thinking-lines"><span></span><span></span></div>
      </div>`
    : "";
  elements.messages.innerHTML = messages + thinking;
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderMemories() {
  elements.memoryCount.textContent = String(state.memories.length);
  if (!state.memories.length) {
    elements.memoryList.innerHTML = `
      <div class="empty-state">Chưa có ký ức dài hạn. Hãy thêm một điều hoặc nói “hãy nhớ rằng...” trong chat.</div>
    `;
    return;
  }
  elements.memoryList.innerHTML = state.memories
    .map(
      (memory) => `
        <article class="memory-item">
          <div>
            <strong>${escapeHtml(displaySubject(memory.subject))}</strong>
            <p>${escapeHtml(memory.content)}</p>
            <div class="memory-meta">
              <span>${escapeHtml(displayKind(memory.kind))}</span>
              <span>độ quan trọng ${Math.round(Number(memory.importance) * 100)}%</span>
              ${memory.event_at ? `<span>${escapeHtml(memory.event_at)}</span>` : ""}
              ${memory.pinned ? "<span>đã ghim</span>" : ""}
            </div>
          </div>
          <button class="danger-button" type="button" data-delete-memory="${memory.id}">Quên</button>
        </article>
      `,
    )
    .join("");
}

function renderGrowthStatus() {
  const status = state.growthStatus;
  if (!status) {
    elements.growthStatus.innerHTML = `<strong>Hộp phản tư</strong><p>Đang đọc trạng thái bằng chứng…</p>`;
    return;
  }
  const count = Number(status.unreflected_count || 0);
  const required = Number(status.required_feedback || 8);
  const negative = Number(status.negative_count || 0);
  const requiredNegative = Number(status.required_negative_feedback || 3);
  const pending = Number(status.pending_count || 0);
  const progress = Math.min(100, Math.round((count / Math.max(1, required)) * 100));
  const nextTime = status.next_eligible_at
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(status.next_eligible_at))
    : null;
  const descriptions = {
    waiting_feedback: `Cần thêm ${Math.max(0, required - count)} đánh giá trước khi Angela tự nhìn lại.`,
    waiting_negative_feedback: `Cần thêm ${Math.max(0, requiredNegative - negative)} phản hồi “Chưa ổn” để tránh học từ tín hiệu quá mơ hồ.`,
    waiting_diversity: "Cần phản hồi từ hai cuộc trò chuyện, hoặc trải qua ít nhất 30 phút.",
    ready: "Đã đủ bằng chứng. Angela có thể tạo một đề xuất để bạn xem xét.",
    scheduled: "Đã xếp một lượt phản tư nền. Angela chỉ tạo đề xuất, không tự áp dụng.",
    running: "Angela đang đối chiếu feedback và bằng chứng trong nền…",
    cooldown: nextTime
      ? `Đã phản tư gần đây. Có thể xem xét batch mới sau ${nextTime}.`
      : "Đã phản tư gần đây; đang trong thời gian chờ an toàn.",
    retry_wait: nextTime
      ? `Lượt trước gặp lỗi. Sẽ có thể thử lại sau ${nextTime}.`
      : "Lượt trước gặp lỗi; Angela đang chờ trước khi thử lại.",
  };
  elements.growthStatus.innerHTML = `
    <div class="growth-status-heading">
      <strong>Hộp phản tư</strong>
      <span>${count}/${required} đánh giá · ${negative}/${requiredNegative} chưa ổn</span>
    </div>
    <div class="growth-progress" aria-hidden="true"><span style="width: ${progress}%"></span></div>
    <p>${escapeHtml(descriptions[status.state] || "Đang chờ thêm bằng chứng phù hợp.")}</p>
    <small>${pending ? `${pending} đề xuất đang chờ bạn duyệt.` : "Chưa có thay đổi nào được tự động áp dụng."}</small>
  `;
  elements.analyzeGrowth.disabled = ["scheduled", "running"].includes(status.state);
  elements.analyzeGrowth.textContent = status.eligible
    ? "Phản tư từ feedback"
    : "Kiểm tra bằng chứng";
}

function renderProposals() {
  const pending = state.proposals.filter((proposal) => proposal.status === "pending");
  elements.proposalCount.textContent = String(pending.length);
  if (!state.proposals.length) {
    elements.proposalList.innerHTML = `
      <div class="empty-state">Chưa có đề xuất. Hãy đánh giá vài câu trả lời rồi chạy phân tích feedback.</div>
    `;
    return;
  }
  elements.proposalList.innerHTML = state.proposals
    .map(
      (proposal) => `
        <article class="proposal-item">
          <div>
            <strong>${escapeHtml(proposal.title)}</strong>
            <p>${escapeHtml(proposal.rationale)}</p>
            <div class="proposal-meta">
              <span>${escapeHtml(proposal.field)}</span>
              <span>từ ${escapeHtml(JSON.stringify(proposal.base_value))}</span>
              <span>giá trị mới: ${escapeHtml(JSON.stringify(proposal.proposed_value))}</span>
              <span>${escapeHtml(proposal.status)}</span>
            </div>
            ${
              proposal.evidence?.length
                ? `<p class="proposal-evidence">Bằng chứng đã xác minh: message ${proposal.evidence.map((id) => `#${escapeHtml(id)}`).join(", ")}.</p>`
                : ""
            }
            ${
              proposal.status === "pending"
                ? `<div class="proposal-actions">
                    <p class="proposal-approval-note">Angela chưa áp dụng thay đổi này.</p>
                    <button class="primary-button" type="button" data-growth-action="apply" data-proposal-id="${proposal.id}">Áp dụng</button>
                    <button class="secondary-button" type="button" data-growth-action="reject" data-proposal-id="${proposal.id}">Bỏ qua</button>
                  </div>`
                : ""
            }
          </div>
        </article>
      `,
    )
    .join("");
}

function renderRecalled() {
  if (!state.recalledMemories.length) {
    elements.recalledList.innerHTML = `<p class="muted-copy">Ký ức liên quan sẽ xuất hiện ở đây khi trò chuyện.</p>`;
    return;
  }
  elements.recalledList.innerHTML = state.recalledMemories
    .map(
      (memory) => `
        <article class="recalled-memory">
          <strong>${escapeHtml(displaySubject(memory.subject))}</strong>
          <p>${escapeHtml(memory.content)}</p>
          <div class="memory-meta"><span>độ liên quan ${Math.round(Number(memory.score) * 100)}%</span></div>
        </article>
      `,
    )
    .join("");
}

function setView(view) {
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("is-visible", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.querySelector("#context-panel").hidden = view !== "chat";
}

async function reloadBootstrap(conversationId = null) {
  const suffix = conversationId ? `?conversation_id=${conversationId}` : "";
  const payload = await api(`/api/bootstrap${suffix}`);
  applyBootstrap(payload);
}

async function sendMessage(event) {
  event.preventDefault();
  await submitMessage({ source: "typed" });
}

async function submitMessage({ message = null, source = "typed" } = {}) {
  const cleanMessage = String(message ?? elements.input.value).trim();
  if (!cleanMessage) return false;
  if (state.sending) {
    if (source === "voice") {
      state.pendingVoiceMessage = cleanMessage;
      elements.input.value = "";
      resizeComposer();
      renderVoiceState();
    }
    return false;
  }

  cancelSpeech({ render: false });
  const epoch = state.voice.epoch + 1;
  const requestId = createRequestId();
  const controller = new AbortController();
  const temporaryUserId = `temp-user-${epoch}-${Date.now()}`;
  state.voice.epoch = epoch;
  state.voice.requestId = requestId;
  state.voice.abortController = controller;
  state.voice.request = "connecting";
  state.voice.requestSource = source;
  state.voice.temporaryUserId = temporaryUserId;
  state.voice.assistantDraftId = null;
  state.voice.streamText = "";
  state.voice.sentenceBuffer = "";
  state.voice.speechSuppressedEpoch = null;
  state.voice.error = null;
  state.messages.push({ id: temporaryUserId, role: "user", content: cleanMessage });
  state.sending = true;
  elements.input.value = "";
  elements.sendButton.disabled = true;
  elements.messages.setAttribute("aria-busy", "true");
  resizeComposer();
  renderMessages();
  renderVoiceState();

  let completed = false;
  try {
    const payload = state.voice.capabilities.streaming
      ? await streamChat(cleanMessage, epoch, requestId, controller.signal)
      : await sendChatFallback(cleanMessage, epoch, controller.signal);
    if (epoch !== state.voice.epoch) return false;
    completed = true;
    schedulePostChatRefresh(payload.conversation_id);
    return true;
  } catch (error) {
    if (epoch !== state.voice.epoch) return false;
    removeTemporaryTurn(epoch);
    const aborted = error?.name === "AbortError";
    state.voice.request = aborted ? "aborted" : "error";
    state.voice.error = aborted ? null : error.message;
    if (!aborted) {
      if (!elements.input.value.trim()) elements.input.value = cleanMessage;
      resizeComposer();
      showToast(error.message || "Không thể hoàn tất câu trả lời.");
    }
    renderMessages();
    return false;
  } finally {
    if (epoch === state.voice.epoch) {
      state.sending = false;
      state.voice.abortController = null;
      state.voice.requestId = null;
      if (completed || state.voice.request === "aborted") state.voice.request = "idle";
      elements.sendButton.disabled = false;
      elements.messages.removeAttribute("aria-busy");
      elements.messages.setAttribute("aria-live", "off");
      renderVoiceState();
      if (source === "typed" && !state.pendingVoiceMessage) elements.input.focus();
      if (completed) sendPendingVoiceMessage();
      else restorePendingVoiceMessage();
    }
  }
}

async function streamChat(message, epoch, requestId, signal) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: state.conversation?.id,
      message,
      request_id: requestId,
    }),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Yêu cầu thất bại (${response.status})`);
  }
  let finalPayload = null;
  const parser = VoiceCore.createNdjsonParser((event) => {
    const handled = handleStreamEvent(event, epoch);
    if (handled) finalPayload = handled;
  });
  if (!response.body) {
    parser.push(await response.text());
    parser.finish();
    if (!finalPayload) throw new Error("Phản hồi streaming không hợp lệ.");
    return finalPayload;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (epoch !== state.voice.epoch) {
        await reader.cancel();
        throw new DOMException("Stream đã bị hủy", "AbortError");
      }
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch (_) {
      // The transport may already be closed by the server.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!finalPayload) throw new Error("Kết nối đã đóng trước khi Angela trả lời xong.");
  return finalPayload;
}

async function sendChatFallback(message, epoch, signal) {
  const payload = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: state.conversation?.id,
      message,
    }),
    signal,
  });
  if (epoch !== state.voice.epoch) {
    throw new DOMException("Yêu cầu đã bị hủy", "AbortError");
  }
  replaceTemporaryUser(payload.user_message, { committed: true });
  state.messages.push(payload.assistant_message);
  state.recalledMemories = payload.recalled_memories || [];
  state.voice.request = "done";
  state.voice.streamText = payload.assistant_message.content;
  if (state.voice.outputEnabled) {
    appendSpeechDelta(payload.assistant_message.content, epoch);
    flushSpeechBuffer(epoch);
  }
  renderMessages();
  renderRecalled();
  return payload;
}

function handleStreamEvent(event, epoch) {
  if (epoch !== state.voice.epoch) return null;
  if (event.request_id && event.request_id !== state.voice.requestId) return null;
  if (event.type === "error") {
    const error = new Error(event.error || "Streaming gặp lỗi.");
    error.retryable = Boolean(event.retryable);
    throw error;
  }
  if (event.type === "start") {
    replaceTemporaryUser(event.user_message);
    state.recalledMemories = event.recalled_memories || [];
    state.voice.request = "streaming";
    ensureAssistantDraft(epoch);
    elements.messages.setAttribute("aria-live", "off");
    renderMessages();
    renderRecalled();
    renderVoiceState();
    return null;
  }
  if (event.type === "delta") {
    state.voice.request = "streaming";
    appendAssistantDelta(String(event.content || ""), epoch);
    return null;
  }
  if (event.type === "done") {
    const assistant = event.assistant_message;
    const streamedText = state.voice.streamText;
    const draftIndex = state.messages.findIndex(
      (item) => item.id === state.voice.assistantDraftId,
    );
    if (draftIndex >= 0) state.messages[draftIndex] = assistant;
    else if (assistant) state.messages.push(assistant);
    replaceTemporaryUser(event.user_message, { committed: true });
    state.recalledMemories = event.recalled_memories || state.recalledMemories;
    state.voice.assistantDraftId = null;
    state.voice.request = "done";
    if (!streamedText && assistant?.content && state.voice.outputEnabled) {
      appendSpeechDelta(assistant.content, epoch);
    }
    flushSpeechBuffer(epoch);
    elements.messages.setAttribute("aria-live", "off");
    renderMessages();
    renderRecalled();
    renderVoiceState();
    return event;
  }
  return null;
}

function replaceTemporaryUser(userMessage, { committed = false } = {}) {
  if (!userMessage) return;
  const index = state.messages.findIndex(
    (item) => item.id === state.voice.temporaryUserId,
  );
  if (index >= 0) state.messages[index] = userMessage;
  state.voice.temporaryUserId = committed ? null : userMessage.id;
}

function ensureAssistantDraft(epoch) {
  if (state.voice.assistantDraftId) return;
  const id = `stream-assistant-${epoch}`;
  state.voice.assistantDraftId = id;
  state.messages.push({
    id,
    role: "assistant",
    content: "",
    streaming: true,
    streamEpoch: epoch,
  });
}

function appendAssistantDelta(delta, epoch) {
  if (!delta || epoch !== state.voice.epoch) return;
  ensureAssistantDraft(epoch);
  state.voice.streamText += delta;
  const draft = state.messages.find((item) => item.id === state.voice.assistantDraftId);
  if (draft) draft.content = state.voice.streamText;
  let content = elements.messages.querySelector(
    `[data-stream-epoch="${epoch}"] .message-content`,
  );
  if (!content) {
    renderMessages();
    content = elements.messages.querySelector(
      `[data-stream-epoch="${epoch}"] .message-content`,
    );
  }
  if (content) content.textContent = state.voice.streamText;
  elements.messages.scrollTop = elements.messages.scrollHeight;
  if (state.voice.outputEnabled) appendSpeechDelta(delta, epoch);
  renderVoiceState();
}

function removeTemporaryTurn(epoch) {
  state.messages = state.messages.filter(
    (item) =>
      item.id !== state.voice.temporaryUserId &&
      item.id !== state.voice.assistantDraftId &&
      item.streamEpoch !== epoch,
  );
  state.voice.temporaryUserId = null;
  state.voice.assistantDraftId = null;
  state.voice.streamText = "";
}

function schedulePostChatRefresh(conversationId) {
  window.setTimeout(refreshMemories, 1200);
  window.setTimeout(() => {
    if (!state.sending && Number(state.conversation?.id) === Number(conversationId)) {
      reloadBootstrap(conversationId).catch(() => {});
    }
  }, 2600);
}

function sendPendingVoiceMessage() {
  if (state.sending || !state.pendingVoiceMessage) return;
  const message = state.pendingVoiceMessage;
  state.pendingVoiceMessage = null;
  window.setTimeout(() => submitMessage({ message, source: "voice" }), 0);
}

function restorePendingVoiceMessage() {
  if (!state.pendingVoiceMessage) return;
  elements.input.value = VoiceCore.joinTranscript(
    elements.input.value,
    state.pendingVoiceMessage,
  );
  state.pendingVoiceMessage = null;
  resizeComposer();
  renderVoiceState();
}

function createRequestId() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `angela-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function signalBackendCancellation(requestId) {
  if (!requestId) return { cancelled: false, matched_active: false };
  try {
    return await api("/api/chat/cancel", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId }),
    });
  } catch (_) {
    return { cancelled: false, matched_active: false };
  }
}

function cancelResponse({ reason = "manual", announce = true } = {}) {
  const conversationId = state.conversation?.id;
  const activeEpoch = state.voice.epoch;
  const pendingVoiceMessage = state.pendingVoiceMessage;
  const requestId = state.voice.requestId;
  const hadRequest = state.sending || ["connecting", "streaming"].includes(state.voice.request);
  const cancelAcknowledgement = hadRequest
    ? signalBackendCancellation(requestId)
    : Promise.resolve({ cancelled: false, matched_active: false });
  state.voice.epoch += 1;
  state.voice.abortController?.abort();
  state.voice.abortController = null;
  state.voice.requestId = null;
  state.sending = false;
  state.pendingVoiceMessage = null;
  removeTemporaryTurn(activeEpoch);
  cancelSpeech({ render: false });
  cancelListening();
  state.voice.request = "idle";
  state.voice.error = null;
  elements.sendButton.disabled = false;
  elements.messages.removeAttribute("aria-busy");
  elements.messages.setAttribute("aria-live", "off");
  renderMessages();
  renderVoiceState();
  if (announce) showToast(reason === "navigation" ? "Đã dừng phiên trước." : "Đã dừng câu trả lời.");
  if (reason === "manual" && pendingVoiceMessage) {
    state.pendingVoiceMessage = pendingVoiceMessage;
    renderVoiceState();
    window.setTimeout(sendPendingVoiceMessage, 150);
  } else if (reason === "manual") {
    elements.input.focus();
  }
  if (hadRequest && conversationId) {
    cancelAcknowledgement.then((acknowledgement) => {
      if (acknowledgement?.matched_active) return;
      window.setTimeout(() => {
        if (!state.sending && Number(state.conversation?.id) === Number(conversationId)) {
          reloadBootstrap(conversationId).catch(() => {});
        }
      }, 250);
    });
  }
}

async function refreshMemories() {
  try {
    const payload = await api("/api/memories");
    state.memories = payload.memories || [];
    renderMemories();
  } catch (_) {
    // A background refresh is best effort only.
  }
}

function resizeComposer() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 180)}px`;
}

async function createConversation() {
  if (
    state.sending ||
    state.voice.speech === "speaking" ||
    ["starting", "listening", "stopping"].includes(state.voice.recognition)
  ) {
    cancelResponse({ reason: "navigation", announce: false });
  }
  try {
    const payload = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "Cuộc trò chuyện mới" }),
    });
    state.recalledMemories = [];
    await reloadBootstrap(payload.conversation.id);
    setView("chat");
    elements.input.focus();
  } catch (error) {
    showToast(error.message);
  }
}

async function addMemory(event) {
  event.preventDefault();
  const content = elements.memoryContent.value.trim();
  if (!content) return;
  try {
    const payload = await api("/api/memories", {
      method: "POST",
      body: JSON.stringify({
        kind: elements.memoryKind.value,
        subject: `manual_${Date.now()}`,
        content,
        pinned: true,
        importance: 0.9,
      }),
    });
    state.memories.unshift(payload.memory);
    elements.memoryContent.value = "";
    renderMemories();
    showToast("Đã ghi vào ký ức dài hạn.");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteMemory(memoryId) {
  if (!window.confirm("Quên ký ức này? Nội dung sẽ bị xóa khỏi truy hồi.")) return;
  try {
    await api(`/api/memories/${memoryId}`, { method: "DELETE" });
    state.memories = state.memories.filter((memory) => memory.id !== memoryId);
    state.recalledMemories = state.recalledMemories.filter(
      (memory) => memory.id !== memoryId,
    );
    renderMemories();
    renderRecalled();
    showToast("Angela đã quên nội dung đó.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitFeedback(messageId, score, note = "") {
  try {
    const payload = await api("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message_id: messageId, score, note }),
    });
    const message = state.messages.find((item) => Number(item.id) === Number(messageId));
    if (message) {
      message.feedback_score = score;
      message.feedback_note = note;
    }
    state.growthStatus = payload.growth_status || state.growthStatus;
    renderMessages();
    renderGrowthStatus();
    if (score === -1 && !note) {
      elements.messages.querySelector(`#feedback-note-${messageId}`)?.focus();
    }
    showToast(
      payload.reflection_scheduled
        ? "Đã lưu. Angela sẽ phản tư trong nền, nhưng không tự áp dụng thay đổi."
        : "Đã lưu feedback để Angela học cách nói chuyện hợp ý hơn.",
    );
    if (payload.reflection_scheduled) {
      window.setTimeout(refreshGrowth, 1200);
      window.setTimeout(refreshGrowth, 4000);
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshGrowth() {
  try {
    const payload = await api("/api/growth");
    state.proposals = payload.proposals || [];
    state.growthStatus = payload.status || state.growthStatus;
    renderProposals();
    renderGrowthStatus();
  } catch (_) {
    // Reflection status is best effort and must never interrupt chat.
  }
}

async function analyzeGrowth() {
  elements.analyzeGrowth.disabled = true;
  elements.analyzeGrowth.textContent = "Đang phân tích...";
  try {
    const payload = await api("/api/growth/analyze", {
      method: "POST",
      body: "{}",
    });
    if (!payload.proposals.length) {
      showToast("Chưa đủ bằng chứng để đề xuất thay đổi.");
    }
    const latest = await api("/api/growth");
    state.proposals = latest.proposals || [];
    state.growthStatus = latest.status || payload.status || state.growthStatus;
    renderProposals();
    renderGrowthStatus();
  } catch (error) {
    showToast(error.message);
  } finally {
    renderGrowthStatus();
  }
}

async function reviewProposal(proposalId, action) {
  try {
    const payload = await api(`/api/growth/${proposalId}/${action}`, {
      method: "POST",
      body: "{}",
    });
    if (payload.profile) state.profile = payload.profile;
    const latest = await api("/api/growth");
    state.proposals = latest.proposals || [];
    state.growthStatus = latest.status || state.growthStatus;
    renderProposals();
    renderGrowthStatus();
    showToast(action === "apply" ? "Đã áp dụng thay đổi." : "Đã bỏ qua đề xuất.");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const payload = await api("/api/profile", {
      method: "POST",
      body: JSON.stringify({
        user_name: elements.userName.value,
        companion_name: elements.companionName.value,
      }),
    });
    state.profile = payload.profile;
    renderAll();
    showToast("Đã lưu cách xưng hô.");
  } catch (error) {
    showToast(error.message);
  }
}

function renderVoiceState() {
  const voice = state.voice;
  const phase = VoiceCore.deriveVoicePhase(voice);
  const outputLabel = voice.outputEnabled ? "bật" : "tắt";
  elements.voiceToggle.textContent = voice.capabilities.synthesis
    ? `Giọng đọc: ${outputLabel}`
    : "Giọng đọc: không hỗ trợ";
  elements.voiceToggleMobile.textContent = voice.capabilities.synthesis
    ? `Đọc: ${outputLabel}`
    : "Không có giọng đọc";
  [elements.voiceToggle, elements.voiceToggleMobile].forEach((button) => {
    button.disabled = !voice.capabilities.synthesis;
    button.setAttribute("aria-pressed", String(voice.outputEnabled));
  });

  const recognitionActive = ["starting", "listening", "stopping"].includes(
    voice.recognition,
  );
  const requestActive = ["connecting", "streaming"].includes(voice.request);
  elements.listenButton.disabled =
    !voice.capabilities.recognition || Boolean(state.pendingVoiceMessage);
  elements.listenButton.classList.toggle("is-listening", recognitionActive);
  elements.listenButton.classList.toggle("is-speaking", voice.speech === "speaking");
  elements.listenButton.setAttribute("aria-pressed", String(recognitionActive));
  if (recognitionActive) {
    elements.listenButton.textContent = voice.recognition === "stopping" ? "Đang gửi" : "Gửi lời nói";
    elements.listenButton.setAttribute("aria-label", "Dừng nghe và tự gửi lời nói");
  } else if (requestActive || voice.speech === "speaking") {
    elements.listenButton.textContent = "Ngắt & nói";
    elements.listenButton.setAttribute(
      "aria-label",
      "Dừng câu trả lời hiện tại và bắt đầu nói",
    );
  } else {
    elements.listenButton.textContent = "Nói";
    elements.listenButton.setAttribute("aria-label", "Bắt đầu nói với Angela");
  }

  elements.stopResponse.hidden = !(requestActive || voice.speech === "speaking");
  elements.voiceStatus.classList.toggle(
    "is-active",
    ["listening", "thinking", "streaming", "streaming-speaking", "speaking"].includes(phase),
  );
  elements.voiceStatus.classList.toggle("is-error", phase === "error");

  let statusText;
  if (state.pendingVoiceMessage) {
    statusText = "Đã nghe. Mình sẽ gửi lời bạn ngay sau câu trả lời hiện tại.";
  } else if (phase === "listening") {
    statusText = "Đang nghe… Nói xong mình sẽ tự gửi.";
  } else if (phase === "thinking") {
    statusText = "Angela đang suy nghĩ…";
  } else if (phase === "streaming-speaking") {
    statusText = "Angela đang trả lời và đọc từng câu. Bạn có thể ngắt lời.";
  } else if (phase === "streaming") {
    statusText = "Angela đang trả lời theo thời gian thực…";
  } else if (phase === "speaking") {
    statusText = "Angela đang đọc. Nhấn Ngắt & nói nếu bạn muốn chen lời.";
  } else if (phase === "error") {
    statusText = voice.error || "Voice vừa gặp lỗi.";
  } else if (!voice.capabilities.recognition) {
    statusText = "Trình duyệt này chưa hỗ trợ nghe giọng nói; bạn vẫn có thể gõ.";
  } else {
    statusText = voice.outputEnabled
      ? "Sẵn sàng nghe và đọc câu trả lời."
      : "Sẵn sàng nghe; giọng đọc đang tắt.";
  }
  if (elements.voiceStatus.textContent !== statusText) {
    elements.voiceStatus.textContent = statusText;
  }
}

function toggleVoice() {
  if (!state.voice.capabilities.synthesis) {
    showToast("Trình duyệt này chưa hỗ trợ đọc giọng nói.");
    return;
  }
  state.voice.outputEnabled = !state.voice.outputEnabled;
  localStorage.setItem("angela.voice", state.voice.outputEnabled ? "on" : "off");
  if (!state.voice.outputEnabled) {
    if (["connecting", "streaming"].includes(state.voice.request)) {
      state.voice.speechSuppressedEpoch = state.voice.epoch;
    }
    cancelSpeech({ render: false });
  }
  renderVoiceState();
}

function selectVietnameseVoice() {
  if (!state.voice.capabilities.synthesis) return;
  const voices = window.speechSynthesis.getVoices();
  state.voice.selectedVoice =
    voices.find((voice) => voice.lang.toLowerCase() === "vi-vn") ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("vi")) ||
    null;
}

function appendSpeechDelta(delta, requestEpoch) {
  if (
    !delta ||
    !state.voice.outputEnabled ||
    !state.voice.capabilities.synthesis ||
    requestEpoch === state.voice.speechSuppressedEpoch ||
    requestEpoch !== state.voice.epoch
  ) {
    return;
  }
  state.voice.sentenceBuffer += delta;
  const extracted = VoiceCore.extractSentences(state.voice.sentenceBuffer);
  state.voice.sentenceBuffer = extracted.remainder;
  extracted.sentences.forEach((sentence) => enqueueSpeech(sentence));
  pumpSpeechQueue();
}

function flushSpeechBuffer(requestEpoch) {
  if (
    !state.voice.outputEnabled ||
    !state.voice.capabilities.synthesis ||
    requestEpoch === state.voice.speechSuppressedEpoch ||
    requestEpoch !== state.voice.epoch
  ) {
    state.voice.sentenceBuffer = "";
    return;
  }
  const extracted = VoiceCore.extractSentences(state.voice.sentenceBuffer, { flush: true });
  state.voice.sentenceBuffer = extracted.remainder;
  extracted.sentences.forEach((sentence) => enqueueSpeech(sentence));
  pumpSpeechQueue();
}

function enqueueSpeech(text) {
  const normalized = VoiceCore.normalizeForSpeech(text);
  if (!normalized) return;
  state.voice.speechQueue.push({
    text: normalized,
    generation: state.voice.speechGeneration,
  });
}

function pumpSpeechQueue() {
  if (
    !state.voice.outputEnabled ||
    !state.voice.capabilities.synthesis ||
    state.voice.currentUtterance ||
    !state.voice.speechQueue.length
  ) {
    if (!state.voice.currentUtterance && !state.voice.speechQueue.length) {
      state.voice.speech = "idle";
      renderVoiceState();
    }
    return;
  }
  const item = state.voice.speechQueue.shift();
  if (item.generation !== state.voice.speechGeneration) {
    pumpSpeechQueue();
    return;
  }
  const generation = item.generation;
  const utterance = new window.SpeechSynthesisUtterance(item.text);
  utterance.lang = "vi-VN";
  utterance.rate = 1;
  utterance.pitch = 1.02;
  if (state.voice.selectedVoice) utterance.voice = state.voice.selectedVoice;
  utterance.onend = () => {
    if (generation !== state.voice.speechGeneration) return;
    state.voice.currentUtterance = null;
    state.voice.speech = "idle";
    pumpSpeechQueue();
  };
  utterance.onerror = (event) => {
    if (generation !== state.voice.speechGeneration) return;
    state.voice.currentUtterance = null;
    state.voice.speech = "idle";
    if (!["canceled", "interrupted"].includes(event.error)) {
      state.voice.error = `Không đọc được giọng nói: ${event.error || "lỗi không rõ"}`;
    }
    pumpSpeechQueue();
  };
  state.voice.currentUtterance = utterance;
  state.voice.speech = "speaking";
  renderVoiceState();
  window.speechSynthesis.speak(utterance);
}

function cancelSpeech({ render = true } = {}) {
  state.voice.speechGeneration += 1;
  state.voice.speechQueue = [];
  state.voice.sentenceBuffer = "";
  state.voice.currentUtterance = null;
  state.voice.speech = "idle";
  window.speechSynthesis?.cancel();
  if (render) renderVoiceState();
}

let recognition = null;

function setupRecognition() {
  if (!SpeechRecognition) {
    elements.listenButton.disabled = true;
    elements.listenButton.title = "Trình duyệt này chưa hỗ trợ nhận giọng nói";
    renderVoiceState();
  }
}

function createRecognitionSession(sessionId) {
  const session = new SpeechRecognition();
  let errorCode = null;
  session.lang = "vi-VN";
  session.continuous = false;
  session.interimResults = true;
  session.onstart = () => {
    if (sessionId !== state.voice.recognitionSessionId) return;
    state.voice.recognition = "listening";
    renderVoiceState();
  };
  session.onresult = (event) => {
    if (sessionId !== state.voice.recognitionSessionId) return;
    const result = VoiceCore.collectRecognitionResults(event, state.voice.finalTranscript);
    state.voice.finalTranscript = result.finalTranscript;
    state.voice.interimTranscript = result.interimTranscript;
    const spoken = VoiceCore.joinTranscript(
      state.voice.finalTranscript,
      state.voice.interimTranscript,
    );
    elements.input.value = VoiceCore.joinTranscript(state.voice.draftBeforeListening, spoken);
    resizeComposer();
    if (result.finalTranscript && state.voice.recognition === "listening") {
      state.voice.recognition = "stopping";
      renderVoiceState();
      session.stop();
    }
  };
  session.onerror = (event) => {
    if (sessionId !== state.voice.recognitionSessionId) return;
    errorCode = event.error;
    state.voice.recognition = "error";
    state.voice.error = mapRecognitionError(event.error);
    if (event.error !== "no-speech" && event.error !== "aborted") showToast(state.voice.error);
    renderVoiceState();
  };
  session.onend = () => {
    if (sessionId !== state.voice.recognitionSessionId) return;
    recognition = null;
    const finalTranscript = state.voice.finalTranscript.trim();
    const draft = state.voice.draftBeforeListening;
    state.voice.recognition = "idle";
    state.voice.interimTranscript = "";
    if (errorCode) {
      state.voice.finalTranscript = "";
      state.voice.draftBeforeListening = "";
      elements.input.value = draft;
      resizeComposer();
      renderVoiceState();
      return;
    }
    if (finalTranscript && !state.voice.autoSendCommitted) {
      state.voice.autoSendCommitted = true;
      const message = VoiceCore.joinTranscript(draft, finalTranscript);
      state.voice.finalTranscript = "";
      state.voice.draftBeforeListening = "";
      elements.input.value = message;
      resizeComposer();
      commitVoiceTranscript(message);
      return;
    }
    state.voice.finalTranscript = "";
    state.voice.draftBeforeListening = "";
    elements.input.value = draft;
    resizeComposer();
    renderVoiceState();
  };
  return session;
}

/*
 * A fresh Web Speech object is created for every listening session. This keeps
 * a late onend callback from an aborted permission/session flow from mutating
 * the next microphone session.
 */
function startListening() {
  if (!SpeechRecognition) return;
  if (["starting", "listening"].includes(state.voice.recognition) && recognition) {
    state.voice.recognition = "stopping";
    renderVoiceState();
    recognition.stop();
    return;
  }
  if (state.voice.recognition === "stopping") return;

  if (["connecting", "streaming"].includes(state.voice.request)) {
    cancelResponse({ reason: "barge-in", announce: false });
  }
  cancelSpeech({ render: false });
  state.voice.error = null;
  state.voice.autoSendCommitted = false;
  state.voice.draftBeforeListening = elements.input.value.trim();
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";
  state.voice.recognition = "starting";
  const sessionId = state.voice.recognitionSessionId + 1;
  state.voice.recognitionSessionId = sessionId;
  renderVoiceState();
  try {
    recognition = createRecognitionSession(sessionId);
    recognition.start();
  } catch (error) {
    recognition = null;
    state.voice.recognition = "error";
    state.voice.error = "Không thể mở micro. Hãy thử lại sau một nhịp.";
    renderVoiceState();
  }
}

function cancelListening() {
  if (!recognition) return;
  const canceledSession = recognition;
  state.voice.recognitionSessionId += 1;
  recognition = null;
  elements.input.value = state.voice.draftBeforeListening;
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";
  state.voice.recognition = "idle";
  resizeComposer();
  try {
    canceledSession.abort();
  } catch (_) {
    // Recognition may already have ended between the state check and abort.
  }
}

function commitVoiceTranscript(message) {
  elements.input.value = "";
  resizeComposer();
  if (state.sending) {
    state.pendingVoiceMessage = message;
    renderVoiceState();
    return;
  }
  submitMessage({ message, source: "voice" });
}

function mapRecognitionError(code) {
  const messages = {
    "no-speech": "Mình chưa nghe rõ. Bạn có thể bấm Nói và thử lại.",
    "not-allowed": "Micro đang bị chặn. Hãy cho phép quyền micro trong trình duyệt.",
    "service-not-allowed": "Dịch vụ nhận giọng nói đang bị chặn trong trình duyệt.",
    "audio-capture": "Không tìm thấy micro đang hoạt động.",
    network: "Nhận giọng nói của trình duyệt đang mất kết nối mạng.",
    aborted: "Đã dừng nghe.",
  };
  return messages[code] || `Không nhận được giọng nói: ${code || "lỗi không rõ"}`;
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (
      button.dataset.view !== "chat" &&
      (state.sending ||
        state.voice.speech === "speaking" ||
        ["starting", "listening", "stopping"].includes(state.voice.recognition))
    ) {
      cancelResponse({ reason: "navigation", announce: false });
    }
    setView(button.dataset.view);
  });
});

elements.composer.addEventListener("submit", sendMessage);
elements.input.addEventListener("input", () => {
  resizeComposer();
  if (state.voice.error) {
    state.voice.error = null;
    renderVoiceState();
  }
});
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});
elements.newChatButton.addEventListener("click", createConversation);
elements.newChatMobile.addEventListener("click", createConversation);
elements.memoryForm.addEventListener("submit", addMemory);
elements.analyzeGrowth.addEventListener("click", analyzeGrowth);
elements.settingsForm.addEventListener("submit", saveSettings);
elements.voiceToggle.addEventListener("click", toggleVoice);
elements.voiceToggleMobile.addEventListener("click", toggleVoice);
elements.listenButton.addEventListener("click", startListening);
elements.stopResponse.addEventListener("click", () => cancelResponse());

elements.conversationList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-conversation-id]");
  if (!button) return;
  try {
    if (
      state.sending ||
      state.voice.speech === "speaking" ||
      ["starting", "listening", "stopping"].includes(state.voice.recognition)
    ) {
      cancelResponse({ reason: "navigation", announce: false });
    }
    state.recalledMemories = [];
    await reloadBootstrap(button.dataset.conversationId);
    setView("chat");
  } catch (error) {
    showToast(error.message);
  }
});

elements.memoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-memory]");
  if (button) deleteMemory(button.dataset.deleteMemory);
});

elements.messages.addEventListener("click", (event) => {
  const button = event.target.closest("[data-feedback]");
  if (button) {
    const message = state.messages.find(
      (item) => Number(item.id) === Number(button.dataset.messageId),
    );
    submitFeedback(
      button.dataset.messageId,
      Number(button.dataset.feedback),
      Number(button.dataset.feedback) === -1 ? message?.feedback_note || "" : "",
    );
    return;
  }
  const saveNote = event.target.closest("[data-save-feedback-note]");
  if (saveNote) {
    const article = saveNote.closest("[data-message-id]");
    const note = article?.querySelector("[data-feedback-note-input]")?.value.trim() || "";
    submitFeedback(saveNote.dataset.messageId, -1, note);
  }
});

elements.proposalList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-growth-action]");
  if (button) reviewProposal(button.dataset.proposalId, button.dataset.growthAction);
});

async function initialize() {
  selectVietnameseVoice();
  if (state.voice.capabilities.synthesis) {
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", selectVietnameseVoice);
    } else {
      window.speechSynthesis.onvoiceschanged = selectVietnameseVoice;
    }
  }
  setupRecognition();
  renderVoiceState();
  try {
    const payload = await api("/api/bootstrap");
    applyBootstrap(payload);
    elements.input.focus();
  } catch (error) {
    showToast(`Không khởi động được Angela: ${error.message}`);
  }
}

window.addEventListener("beforeunload", () => {
  state.voice.epoch += 1;
  state.voice.abortController?.abort();
  window.speechSynthesis?.cancel();
  if (recognition) {
    state.voice.recognitionSessionId += 1;
    try {
      recognition.abort();
    } catch (_) {
      // The browser is already tearing the page down.
    }
  }
});

initialize();
