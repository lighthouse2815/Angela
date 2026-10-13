import type { GenerationProvider } from '@proj-airi/provider-inference'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useLLM } from './ai/chat-llm/llm'
import { useChatStore } from './chat'
import { useChatSessionStore } from './chat/session-store'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useConsciousnessStore } from './modules/consciousness'
import { useLearningMemoryStore } from './modules/learning-memory'

const stores: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const pinia of stores.splice(0)) {
    useModsServerChannelStore(pinia).dispose()
    useChatStore(pinia).dispose()
    disposePinia(pinia)
  }
  localStorage.clear()
})

it('injects remembered learning facts into session chat and removes them when memory is disabled', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [], voices: [], recommended: {} })))
  const modules = {
    consciousness: { provider: 'google-generative-ai', model: 'models/gemini-3.1-flash-lite' },
    vision: { provider: '', model: '' },
    speech: { provider: 'speech-noop', model: '', voice_id: '' },
  }
  localStorage.setItem('airi-cards', JSON.stringify([['default', { name: 'Angela', version: '1.0', extensions: { airi: { agents: {}, modules } } }]]))
  localStorage.setItem('airi-card-module-defaults', JSON.stringify(modules))
  const pinia = createPinia()
  stores.push(pinia)
  render(defineComponent({
    setup() {
      useChatStore()
      return () => h('div')
    },
  }), {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const sessionId = sessions.activeSessionId
  const memory = useLearningMemoryStore(pinia)
  await memory.save('default', 'difficulty', 'Needs help with Python loops')
  await memory.save('other', 'topic', 'Private lesson for another character')
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/' } }),
  }
  vi.spyOn(useConsciousnessStore(pinia), 'getChatProviderInstance').mockResolvedValue(provider)
  const stream = vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, _context, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'Let us review loops.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  try {
    await chat.send({ sessionId, messageId: 'learning-1', text: 'What was I studying?' })
    expect(JSON.stringify(stream.mock.calls[0][2])).toContain('Needs help with Python loops')
    expect(JSON.stringify(stream.mock.calls[0][2])).not.toContain('Private lesson for another character')
    const options = stream.mock.calls[0][3]
    const tools = typeof options?.tools === 'function' ? await options.tools() : options?.tools
    expect(tools?.map(tool => tool.function.name)).toContain('remember_learning')
    await memory.setEnabled(false)
    await chat.send({ sessionId, messageId: 'learning-2', text: 'Memory is disabled now.' })
    expect(JSON.stringify(stream.mock.calls[1][2])).not.toContain('Needs help with Python loops')
    const disabledOptions = stream.mock.calls[1][3]
    const disabledTools = typeof disabledOptions?.tools === 'function' ? await disabledOptions.tools() : disabledOptions?.tools
    expect(disabledTools?.map(tool => tool.function.name)).not.toContain('remember_learning')
  }
  finally {
    await sessions.deleteSession(sessionId)
  }
})
