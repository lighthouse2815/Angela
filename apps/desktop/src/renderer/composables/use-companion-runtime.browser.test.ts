import type { RecordsResponse } from '@angela/cli/companion-contracts'
import type { GenerationProvider } from '@angela/provider-inference'

import type { CompanionBegin, CompanionReady } from '../../shared/eventa/companion-runtime'

import en from '@angela/i18n/locales/en'

import { setupSynced, usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { useLLM } from '@angela/stage-ui/stores/ai/chat-llm/llm'
import { useChatStore } from '@angela/stage-ui/stores/chat'
import { useChatSessionStore } from '@angela/stage-ui/stores/chat/session-store'
import { useModsServerChannelStore } from '@angela/stage-ui/stores/mods/api/channel-server'
import { useConsciousnessStore } from '@angela/stage-ui/stores/modules/consciousness'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useCompanionRuntime } from './use-companion-runtime'

const ipc = vi.hoisted(() => ({
  begin: vi.fn<(input: CompanionBegin) => Promise<CompanionReady>>(),
  records: vi.fn<() => Promise<RecordsResponse>>(),
  finish: vi.fn().mockResolvedValue(undefined),
  observe: vi.fn().mockResolvedValue(undefined),
  reminders: vi.fn().mockResolvedValue(null),
}))
vi.mock('@angela/electron-vueuse', async () => {
  const events = await import('../../shared/eventa/companion-runtime')
  return { useElectronEventaInvoke: (event: unknown) => {
    if (event === events.companionBegin)
      return ipc.begin
    if (event === events.companionRecords)
      return ipc.records
    if (event === events.companionObserve)
      return ipc.observe
    if (event === events.companionReminders)
      return ipc.reminders
    return ipc.finish
  } }
})
vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn(), error: vi.fn() }) }))
const contexts: (() => void)[] = []
afterEach(() => {
  for (const dispose of contexts.splice(0))
    dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  localStorage.clear()
})
async function renderer() {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [], voices: [], recommended: {} })))
  const modules = { consciousness: { provider: 'google-generative-ai', model: 'models/gemini-3.1-flash-lite' }, vision: { provider: '', model: '' }, speech: { provider: 'speech-noop', model: '', voice_id: '' } }
  localStorage.setItem('airi-cards', JSON.stringify([['default', { name: 'Angela', version: '1.0', extensions: { airi: { agents: {}, modules } } }]]))
  localStorage.setItem('airi-card-module-defaults', JSON.stringify(modules))
  ipc.records.mockResolvedValue({ snapshot: { characterId: 'default', enabled: true, reviewRemindersEnabled: false, memories: [], companion: { enabled: false, entries: [], lastPromptAt: 0 } } })
  const pinia = createPinia()
  const synced = setupSynced({ leadership: 'leader-only' })
  pinia.use(synced.pinia)
  let leader: ReturnType<typeof usePiniaSynced> | undefined
  const app = createApp({ setup() {
    leader = usePiniaSynced()
    useCompanionRuntime()
    return () => h('div')
  } })
  const host = document.createElement('div')
  document.body.append(host)
  app.use(pinia).use(synced.vue).use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(host)
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  contexts.push(() => {
    chat.dispose()
    useModsServerChannelStore(pinia).dispose()
    app.unmount()
    disposePinia(pinia)
    host.remove()
  })
  await expect.poll(() => leader?.isLeader()).toBe(true)
  await sessions.initialize()
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/' } }) }
  vi.spyOn(useConsciousnessStore(pinia), 'getChatProviderInstance').mockResolvedValue(provider)
  const stream = vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, _context, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'A shared example.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  return { chat, sessions, stream, sessionId: sessions.activeSessionId }
}

it('passes original user text and message identities to main while retaining renderer generation', async () => {
  ipc.begin.mockResolvedValue({ kind: 'generate', context: 'Shared runtime context', tools: [] })
  const { chat, sessions, stream, sessionId } = await renderer()
  await chat.send({ sessionId, messageId: 'source-1', text: 'Explain loops' })
  await chat.send({ sessionId, messageId: 'source-2', text: 'Give an example' })
  expect(ipc.begin.mock.calls[0][0].text).toBe('Explain loops')
  expect(ipc.begin.mock.calls[1][0].history).toContainEqual({ id: 'source-1', type: 'user', text: 'Explain loops' })
  expect(JSON.stringify(stream.mock.calls[0][2])).toContain('Shared runtime context')
  expect(ipc.observe).toHaveBeenCalled()
  expect(ipc.finish).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false, failed: false }))
  expect(sessions.getSessionMessages(sessionId).some(message => message.role === 'assistant')).toBe(true)
})

it('persists direct runtime replies without invoking the renderer provider', async () => {
  ipc.begin.mockResolvedValue({ kind: 'reply', text: 'Đã tạo lời nhắc.' })
  const { chat, sessions, stream, sessionId } = await renderer()
  await chat.send({ sessionId, messageId: 'task', text: 'Nhắc tôi học sau 10 phút' })
  expect(stream).not.toHaveBeenCalled()
  expect(JSON.stringify(sessions.getSessionMessages(sessionId))).toContain('Đã tạo lời nhắc.')
  expect(ipc.finish).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false, failed: false }))
})

it('retains a protected conversation policy beyond the bounded history sent to main', async () => {
  ipc.begin.mockResolvedValue({ kind: 'generate', context: '', tools: [] })
  const { chat, sessions, sessionId } = await renderer()
  sessions.appendSessionMessage(sessionId, { role: 'user', id: 'protected', content: 'Don\'t save this' })
  for (let index = 0; index < 105; index++)
    sessions.appendSessionMessage(sessionId, { role: 'user', id: `earlier-${index}`, content: 'Continue the lesson' })
  await chat.send({ sessionId, messageId: 'latest', text: 'Remember I prefer examples' })
  const input = ipc.begin.mock.calls[0][0]
  expect(input.history).toHaveLength(100)
  expect(input.history.some(message => message.id === 'protected')).toBe(false)
  expect(input.protectedHistory).toBe(true)
})

it('releases the main request when voice interruption cancels renderer generation', async () => {
  ipc.begin.mockResolvedValue({ kind: 'generate', context: '', tools: [] })
  const { chat, stream, sessionId } = await renderer()
  stream.mockImplementation(async (_model, _provider, _context, options) => {
    const signal = options?.abortSignal
    if (!signal)
      throw new Error('Cancellation signal expected')
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  const pending = chat.send({ sessionId, messageId: 'voice-turn', text: 'Continue speaking' })
  await expect.poll(() => stream.mock.calls.length).toBe(1)
  await chat.cancelTurn({ sessionId, turnId: 'voice-turn' })
  await pending
  expect(ipc.finish).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true, failed: false }))
})
