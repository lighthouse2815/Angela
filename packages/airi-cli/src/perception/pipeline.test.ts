import type { GenerationProvider } from '@angela/provider-inference'

import { fileURLToPath } from 'node:url'

import { expect, it, vi } from 'vitest'

import { Chat } from '../chat'
import { AffectEngine } from './affect-engine'
import { CameraContextProvider } from './camera-context'
import { OpenSeeFaceProvider, readCameraConfig } from './openseeface-provider'

it('runs a real fixture subprocess through validation, temporal cues, request context and the model API', async () => {
  const config = readCameraConfig({ ANGELA_CAMERA_PYTHON: 'python3' })
  const provider = new OpenSeeFaceProvider({ ...config, worker: fileURLToPath(new URL('./fixtures/worker.py', import.meta.url)) })
  const engine = new AffectEngine({ windowMs: 200, faceDebounceMs: 100, expressionDebounceMs: 100, screenDebounceMs: 100 })
  const context = new CameraContextProvider()
  let observations = 0
  const received = Promise.withResolvers<void>()
  const unsubscribe = provider.subscribe((observation) => {
    engine.observe(observation)
    observations++
    if (observations === 20)
      received.resolve()
  })
  try {
    await provider.start()
    await received.promise
    expect(provider.status.state).toBe('on')
    expect(provider.status.invalidEvents).toBe(0)
    expect(engine.getState()).toMatchObject({ facePresent: true, expression: 'smile', attention: 'screen' })
    const cue = context.getContext(engine.getState())
    expect(cue).toContain('expression=smile')

    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Let us try another example.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
    const model: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'http://model.example/v1/', fetch } }) }
    const chat = new Chat('test', model, '/workspace')
    await chat.send('Explain this step', {}, cue)
    const request = String(fetch.mock.calls[0][1]?.body)
    expect(request).toContain('uncertain soft cues')
    expect(request).toContain('expression=smile')
    expect(request).toContain('The user\'s words take priority')
    expect(request).not.toContain('smileLike')
    expect(request).not.toContain('headPose')
    expect(request).not.toContain('image_url')
    expect(JSON.stringify(chat.conversation)).not.toContain('Visual context')
    await provider.stop()
    engine.reset()
    await chat.send('Continue with camera off', {})
    expect(String(fetch.mock.calls[1][1]?.body)).not.toContain('Visual context')
  }
  finally {
    unsubscribe()
    await provider.stop()
  }
})
