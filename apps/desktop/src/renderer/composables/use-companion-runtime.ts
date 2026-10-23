import type { Conversation, StreamOptions } from '@angela/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { requestPrivacy } from '@angela/companion/companion-contracts'
import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { extractMessageText } from '@angela/stage-ui/libs/chat-sync/index'
import { usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { installCompanionTransport } from '@angela/stage-ui/services/companion-runtime'
import { useSpeakingStore } from '@angela/stage-ui/stores/audio'
import { useChatStore } from '@angela/stage-ui/stores/chat'
import { useChatSessionStore } from '@angela/stage-ui/stores/chat/session-store'
import { useAngelaCardStore } from '@angela/stage-ui/stores/modules/angela-card'
import { useCompanionStore } from '@angela/stage-ui/stores/modules/companion'
import { useLearningMemoryStore } from '@angela/stage-ui/stores/modules/learning-memory'
import { useDocumentVisibility, useIdle, useIntervalFn } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { companionBegin, companionFinish, companionObserve, companionRecords, companionReminders, companionTool } from '../../shared/eventa/companion-runtime'

/** Installs the Node boundary before chat starts. Polling refreshes views of edits made by the linked Telegram process. */
export function useCompanionRuntime() {
  const records = useElectronEventaInvoke(companionRecords)
  const begin = useElectronEventaInvoke(companionBegin)
  const execute = useElectronEventaInvoke(companionTool)
  const observe = useElectronEventaInvoke(companionObserve)
  const finish = useElectronEventaInvoke(companionFinish)
  const reminders = useElectronEventaInvoke(companionReminders)
  const learning = useLearningMemoryStore()
  const companion = useCompanionStore()
  const cards = useAngelaCardStore()
  const synced = usePiniaSynced()
  const chat = useChatStore()
  const sessions = useChatSessionStore()
  const speaking = useSpeakingStore()
  const visibility = useDocumentVisibility()
  const { idle, stop: stopIdle } = useIdle(60000)
  let reminderToast: string | number | undefined
  let disposed = false
  let refreshing = false
  let importErrorShown = false
  const { t } = useI18n()

  const uninstall = installCompanionTransport({
    records: (characterId, command) => records({ characterId, command }),
    run: async (characterId, sessionId, conversation, options, generate) => {
      const requestId = crypto.randomUUID()
      const messages = sessions.getSessionMessages(sessionId)
      const turnId = options.requestCorrelation?.turnId
      const userIndex = messages.findLastIndex(message => message.role === 'user' && message.id === turnId)
      if (userIndex < 0)
        throw new Error('The original companion message is unavailable')
      const user = messages[userIndex]
      const originalText = (message: typeof user) => [extractMessageText(message), ...(message.audioTranscripts ?? [])].filter(Boolean).join('\n')
      const text = originalText(user)
      const previous = messages.slice(0, userIndex).filter(message => message.role === 'user' || message.role === 'assistant')
      const protectedHistory = previous.some(message => message.role === 'user' && !requestPrivacy(originalText(message)).durableMemoryAllowed)
      const history = previous.slice(-100).map(message => ({
        id: message.id ?? crypto.randomUUID(),
        type: message.role === 'user' ? 'user' as const : 'assistant' as const,
        text: originalText(message).slice(0, 32000),
      }))
      let cancelled = false
      let failed = true
      let stopPromise: Promise<void> | undefined
      const abort = () => {
        cancelled = true
        stopPromise ??= finish({ requestId, cancelled: true, failed: false })
        void stopPromise.catch(() => {})
      }
      options.abortSignal?.addEventListener('abort', abort, { once: true })
      try {
        options.abortSignal?.throwIfAborted()
        const ready = await begin({ requestId, characterId, sessionId, text, history, protectedHistory })
        options.abortSignal?.throwIfAborted()
        if (ready.kind === 'reply') {
          await options.onStreamEvent?.({ type: 'text-delta', text: ready.text })
          await options.onStreamEvent?.({ type: 'finish' })
        }
        else {
          const tools: Tool[] = ready.tools.map(definition => ({ ...definition, execute: input => execute({ requestId, name: definition.function.name, input }) }))
          const existing = typeof options.tools === 'function' ? await options.tools() : options.tools
          const names = new Set(tools.map(tool => tool.function.name))
          const combined = [...(existing ?? []).filter(tool => !names.has(tool.function.name)), ...tools]
          const context: Conversation = { turns: [{ type: 'system', authority: 'system', id: `runtime:${requestId}`, content: [{ type: 'text', text: ready.context }] }, ...conversation.turns] }
          const streamOptions: StreamOptions = {
            ...options,
            tools: combined,
            resolveStep: options.resolveStep ? async () => ({ ...await options.resolveStep!(), tools: combined }) : undefined,
            onStreamEvent: async (event) => {
              await observe({ requestId, event })
              await options.onStreamEvent?.(event)
            },
          }
          await generate(context, streamOptions)
        }
        failed = false
      }
      finally {
        options.abortSignal?.removeEventListener('abort', abort)
        await (stopPromise ?? finish({ requestId, cancelled, failed }))
        if (!disposed) {
          try {
            await learning.refresh(characterId)
            await companion.refresh(characterId)
          }
          catch (error) {
            if (!disposed) {
              console.error('Could not refresh shared companion records:', error)
              toast.error(t('base.companion.import-error'))
            }
          }
        }
      }
    },
  })

  async function refresh() {
    if (disposed || refreshing || !synced.isLeader())
      return
    refreshing = true
    try {
      const characterId = cards.activeCardId
      await learning.refresh(characterId)
      await companion.refresh(characterId)
      if (!sessions.activeSessionId)
        return
      const available = visibility.value === 'visible' && idle.value && !chat.sending && !speaking.nowSpeaking && learning.enabled && companion.state.enabled
      const notification = await reminders({ characterId, sessionId: sessions.activeSessionId, available })
      if (notification) {
        let shown = false
        try {
          if (!disposed && available && synced.isLeader() && cards.activeCardId === characterId && !chat.sending && !speaking.nowSpeaking) {
            reminderToast = toast(notification.text, { duration: 20000 })
            shown = true
          }
        }
        finally {
          await reminders({ characterId, sessionId: sessions.activeSessionId, available: false, receipt: { token: notification.token, shown } })
        }
      }
    }
    catch (error) {
      if (disposed)
        return
      console.error('Shared companion records are unavailable. Local import sources remain intact:', error)
      if (!importErrorShown) {
        importErrorShown = true
        toast.error(t('base.companion.import-error'))
      }
    }
    finally { refreshing = false }
  }
  const stopPresentationWatch = watch(() => [cards.activeCardId, chat.sending, speaking.nowSpeaking, learning.enabled, companion.state.enabled, visibility.value], () => {
    if (reminderToast !== undefined) {
      toast.dismiss(reminderToast)
      reminderToast = undefined
    }
  })
  const interval = useIntervalFn(() => void refresh(), 5000)
  const stopWatch = watch(() => cards.activeCardId, () => void refresh(), { immediate: true })
  onScopeDispose(() => {
    disposed = true
    stopWatch()
    stopPresentationWatch()
    interval.pause()
    stopIdle()
    if (reminderToast !== undefined)
      toast.dismiss(reminderToast)
    uninstall()
  })
}
