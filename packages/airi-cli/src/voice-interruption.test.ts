import { cliMessages } from '@proj-airi/i18n/cli'
import { expect, it, vi } from 'vitest'

import { Voice } from './voice'
import { VoiceInterruption } from './voice-interruption'

function setup() {
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  const turn = new AbortController()
  let state: ((value: 'ready' | 'speech' | 'transcribing') => void) | undefined
  let signal: AbortSignal | undefined
  let transcript: ((value: { kind: 'transcript', text: string }) => void) | undefined
  vi.spyOn(voice, 'listen').mockImplementation(async (command, capture, callback) => {
    expect(command).toBeUndefined()
    state = callback
    signal = capture
    return await new Promise((resolve, reject) => {
      transcript = resolve
      capture.addEventListener('abort', () => reject(capture.reason), { once: true })
    })
  })
  const interruption = new VoiceInterruption(voice, turn, () => {})
  return { turn, interruption, state: () => state!, signal: () => signal!, transcript: () => transcript! }
}

it('stops the previous turn at speech onset and preserves the complete next utterance', async () => {
  const { turn, interruption, state, signal, transcript } = setup()
  state()('ready')
  expect(turn.signal.aborted).toBe(false)
  state()('speech')
  expect(turn.signal.aborted).toBe(true)
  expect(signal().aborted).toBe(false)
  let finished = false
  const next = interruption.finish().then((value) => {
    finished = true
    return value
  })
  await Promise.resolve()
  expect(finished).toBe(false)
  state()('transcribing')
  transcript()({ kind: 'transcript', text: 'Khoan, mở ứng dụng khác' })
  await expect(next).resolves.toBe('Khoan, mở ứng dụng khác')
  expect(signal().aborted).toBe(true)
})

it('closes an idle microphone when playback finishes', async () => {
  const { turn, interruption, signal } = setup()
  await expect(interruption.finish()).resolves.toBeUndefined()
  expect(signal().aborted).toBe(true)
  expect(turn.signal.aborted).toBe(false)
})

it('discards a capture on keyboard cancellation before and after voice interruption', async () => {
  for (const speaking of [false, true]) {
    const { turn, interruption, state, signal } = setup()
    if (speaking)
      state()('speech')
    interruption.cancel()
    turn.abort()
    await expect(interruption.finish()).resolves.toBeUndefined()
    expect(signal().aborted).toBe(true)
  }
})

it('requires explicit headphone mode or a source and sink pair for interruption', () => {
  const env = { ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }
  expect(new Voice(env, cliMessages.en).canInterrupt).toBe(false)
  expect(new Voice({ ...env, ANGELA_VOICE_SOURCE: 'source' }, cliMessages.en).canInterrupt).toBe(false)
  expect(new Voice({ ...env, ANGELA_VOICE_SOURCE: 'source', ANGELA_VOICE_SINK: 'sink' }, cliMessages.en).canInterrupt).toBe(true)
  expect(new Voice({ ...env, ANGELA_VOICE_BARGE_IN: '1' }, cliMessages.en).canInterrupt).toBe(true)
  expect(new Voice({ ...env, ANGELA_VOICE_SOURCE: 'source', ANGELA_VOICE_SINK: 'sink', ANGELA_VOICE_BARGE_IN: '0' }, cliMessages.en).canInterrupt).toBe(false)
})
