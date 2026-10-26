import type { GenerationProvider } from '@angela/provider-inference'

import en from '@angela/i18n/locales/en'

import { toWav } from '@angela/audio/encoding'
import { defineInvoke } from '@moeru/eventa'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import { setupSynced, usePiniaSynced } from '../libs/pinia'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '../services/speech/bus'
import { useLLM } from '../stores/ai/chat-llm/llm'
import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useDisplayModelsStore } from '../stores/display-models'
import { useModsServerChannelStore } from '../stores/mods/api/channel-server'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useProviderConfigStore } from '../stores/providers/config'
import { useSettingsStageModel } from '../stores/settings/stage-model'
import { useSpeechOutputControlStore } from '../stores/speech-output-control'
import { useVoiceStore } from '../stores/voice'
import { useSpeechOutput } from './use-speech-output'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(stop => stop())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function mountOutput() {
  const synthesis = vi.fn()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (String(input).includes('audio/speech')) {
      synthesis()
      return new Response(toWav(new Float32Array(12000).buffer, 24000), { headers: { 'Content-Type': 'audio/wav' } })
    }
    return Response.json({ data: [], voices: [], recommended: {} })
  }))
  const modules = {
    consciousness: { provider: 'openai', model: 'test-chat' },
    vision: { provider: '', model: '' },
    speech: { provider: 'openai-compatible-audio-speech', model: 'test-tts', voice_id: 'test-voice' },
  }
  localStorage.setItem('airi-cards', JSON.stringify([['default', { name: 'Angela', version: '1.0', extensions: { airi: { agents: {}, modules } } }]]))
  localStorage.setItem('airi-card-module-defaults', JSON.stringify(modules))
  const pinia = createPinia()
  const synced = setupSynced({ leadership: 'leader-only' })
  pinia.use(synced.pinia)
  let leader: ReturnType<typeof usePiniaSynced> | undefined
  let output!: ReturnType<typeof useSpeechOutput>
  const app = createApp({ setup() {
    leader = usePiniaSynced()
    output = useSpeechOutput()
    return () => h('div')
  } })
  const host = document.body.appendChild(document.createElement('div'))
  app.use(pinia).use(synced.vue).use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(host)
  let mounted = true
  function unmount() {
    if (mounted) {
      app.unmount()
      mounted = false
    }
  }
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  cleanups.push(() => {
    chat.dispose()
    useModsServerChannelStore(pinia).dispose()
    unmount()
    disposePinia(pinia)
    host.remove()
    void output.audioContext.close()
  })
  await expect.poll(() => leader?.isLeader()).toBe(true)
  await sessions.initialize()
  await useProviderConfigStore(pinia).ensureProvider('openai-compatible-audio-speech', 'openai-compatible-audio-speech', { apiKey: 'test-key', baseUrl: 'https://speech.test/v1/' })
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://chat.test/v1/' } }) }
  vi.spyOn(useConsciousnessStore(pinia), 'getChatProviderInstance').mockResolvedValue(provider)
  vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, _context, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'Hello from Angela.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  return { unmount, pinia, output, chat, sessions, synthesis, host }
}

it('plays generated speech through browser audio without mounting an avatar', async () => {
  const { chat, sessions, output, pinia, synthesis, host } = await mountOutput()
  await output.audioContext.resume()
  await chat.send({ sessionId: sessions.activeSessionId, text: 'Hello' })
  await expect.poll(() => synthesis.mock.calls.length).toBe(1)
  await expect.poll(() => output.currentAudioSource.value).toBeInstanceOf(AudioBufferSourceNode)
  const getPlaybackState = defineInvoke(getSpeechBusContext(), speechOutputGetPlaybackState)
  await expect.poll(async () => (await getPlaybackState()).speaking).toBe(true)
  expect(host.querySelector('canvas')).toBeNull()
  await expect.poll(() => useVoiceStore(pinia).activeTurns.length).toBe(0)
  expect((await getPlaybackState()).speaking).toBe(false)
  expect(JSON.stringify(sessions.getSessionMessages(sessions.activeSessionId))).toContain('Hello from Angela.')
})

it('keeps text replies while muted and releases the output host when unmounted', async () => {
  const { unmount, pinia, chat, sessions, synthesis } = await mountOutput()
  useSpeechOutputControlStore(pinia).speechMuted = true
  await chat.send({ sessionId: sessions.activeSessionId, text: 'Hello quietly' })
  await expect.poll(() => useVoiceStore(pinia).activeTurns.length).toBe(0)
  expect(synthesis).not.toHaveBeenCalled()
  expect(JSON.stringify(sessions.getSessionMessages(sessions.activeSessionId))).toContain('Hello from Angela.')
  unmount()
  const detach = useVoiceStore(pinia).connectOutput(() => {
    throw new Error('No response expected after unmount')
  })
  detach()
})

it('keeps avatar loading disabled across profile selection and reset in a chat-only host', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  cleanups.push(() => disposePinia(pinia))
  const getDisplayModel = vi.spyOn(useDisplayModelsStore(pinia), 'getDisplayModel')
  const settings = useSettingsStageModel(pinia)
  await settings.initializeStageModel({ loadModel: false })
  settings.stageModelSelected = 'saved-avatar'
  await nextTick()
  await settings.initializeStageModel()
  expect(settings.stageModelSelected).toBe('saved-avatar')
  expect(settings.stageModelSelectedUrl).toBeUndefined()
  expect(settings.stageModelRenderer).toBe('disabled')
  await settings.resetState()
  expect(settings.stageModelRenderer).toBe('disabled')
  expect(getDisplayModel).not.toHaveBeenCalled()
})
