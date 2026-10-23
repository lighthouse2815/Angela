import en from '@angela/i18n/locales/en'

import { setupSynced, usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { useSpeakingStore } from '@angela/stage-ui/stores/audio'
import { useChatStore } from '@angela/stage-ui/stores/chat'
import { useModsServerChannelStore } from '@angela/stage-ui/stores/mods/api/channel-server'
import { useCompanionStore } from '@angela/stage-ui/stores/modules/companion'
import { useLearningMemoryStore } from '@angela/stage-ui/stores/modules/learning-memory'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useCompanionFollowUps } from './use-companion-follow-ups'

const presentation = vi.hoisted(() => ({ toast: Object.assign(vi.fn<(message: string, options: { action: { onClick: () => void } }) => string>(() => 'follow-up'), { dismiss: vi.fn(), error: vi.fn() }) }))
vi.mock('vue-sonner', () => ({ toast: presentation.toast }))
const contexts: (() => void)[] = []
async function renderer() {
  const pinia = createPinia()
  const synced = setupSynced({ leadership: 'leader-only' })
  pinia.use(synced.pinia)
  let runtime: ReturnType<typeof usePiniaSynced> | undefined
  const app = createApp({ setup() {
    runtime = usePiniaSynced()
    useCompanionFollowUps()
    return () => h('div')
  } })
  const host = document.createElement('div')
  document.body.append(host)
  app.use(pinia).use(synced.vue).use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(host)
  contexts.push(() => {
    useChatStore(pinia).dispose()
    useModsServerChannelStore(pinia).dispose()
    app.unmount()
    disposePinia(pinia)
    host.remove()
  })
  await expect.poll(() => runtime?.isLeader()).toBe(true)
  return { store: useCompanionStore(pinia), memory: useLearningMemoryStore(pinia), speaking: useSpeakingStore(pinia), chat: useChatStore(pinia) }
}
afterEach(() => {
  for (const dispose of contexts.splice(0))
    dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
  presentation.toast.mockClear()
  presentation.toast.dismiss.mockClear()
  localStorage.clear()
})

it('waits for idle, avoids speaking, and presents a due activity once with dismissal', async () => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 23, 12))
  const ctx = await renderer()
  await ctx.store.setEnabled(true)
  const entry = await ctx.store.save('default', 'activity', 'Study loops', Date.now() - 1)
  ctx.speaking.nowSpeaking = true
  await vi.advanceTimersByTimeAsync(75000)
  expect(presentation.toast).not.toHaveBeenCalled()
  ctx.speaking.nowSpeaking = false
  await vi.advanceTimersByTimeAsync(15000)
  await vi.waitFor(() => expect(presentation.toast).toHaveBeenCalledTimes(1))
  expect(presentation.toast.mock.calls[0][0]).toContain('Study loops')
  await vi.advanceTimersByTimeAsync(60000)
  await vi.waitFor(() => expect(presentation.toast).toHaveBeenCalledTimes(1))
  const [, options] = presentation.toast.mock.calls[0]
  options.action.onClick()
  await vi.advanceTimersByTimeAsync(1)
  expect(ctx.store.forCharacter('default').find(item => item.id === entry.id)?.status).toBe('dismissed')
})

it('does not consume a due record while memory is disabled or chat is sending', async () => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 23, 12))
  const ctx = await renderer()
  await ctx.store.setEnabled(true)
  await ctx.store.save('default', 'thread', 'Interview', Date.now() - 1)
  await ctx.memory.setEnabled(false)
  await vi.advanceTimersByTimeAsync(75000)
  expect(presentation.toast).not.toHaveBeenCalled()
  expect(ctx.store.forCharacter('default')[0].promptedAt).toBeUndefined()
  await ctx.memory.setEnabled(true)
  ctx.chat.sending = true
  await vi.advanceTimersByTimeAsync(15000)
  expect(presentation.toast).not.toHaveBeenCalled()
  ctx.chat.sending = false
  await vi.advanceTimersByTimeAsync(15000)
  await vi.waitFor(() => expect(presentation.toast).toHaveBeenCalledTimes(1))
  await ctx.memory.setEnabled(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(presentation.toast.dismiss).toHaveBeenCalledWith('follow-up')
})
