import { EventEmitter } from 'node:events'
import { writeFile } from 'node:fs/promises'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Voice } from './voice'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  spawn.mockReset()
})

it('requires an explicit audio endpoint before voice mode starts', () => {
  expect(() => new Voice({}, cliMessages.en)).toThrow(cliMessages.en.voiceConfig)
  expect(() => new Voice({ ANGELA_VOICE_BASE_URL: 'file:///tmp/audio' }, cliMessages.en)).toThrow(cliMessages.en.voiceConfig)
})

it('discards capture when the user switches back to chat without an audio request', async () => {
  const child = new EventEmitter()
  const kill = vi.fn(() => {
    queueMicrotask(() => child.emit('close', 0, null))
  })
  Object.assign(child, { kill })
  spawn.mockReturnValue(child)
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  expect(await voice.listen(async () => '/chat', new AbortController().signal)).toBe('/chat')
  expect(kill).toHaveBeenCalledWith('SIGINT')
  expect(fetch).not.toHaveBeenCalled()
})

it('sends the configured TTS model, voice and isolated audio credential before playback', async () => {
  const fetch = vi.fn(async (_url: URL, _init: RequestInit) => new Response(new Uint8Array([82, 73, 70, 70])))
  vi.stubGlobal('fetch', fetch)
  spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1', ANGELA_VOICE_API_KEY: 'audio-key', ANGELA_API_KEY: 'chat-key', ANGELA_TTS_MODEL: 'local-tts', ANGELA_TTS_VOICE: 'vi' }, cliMessages.en)
  await voice.speak('Xin chào', new AbortController().signal)
  expect(String(fetch.mock.calls[0]?.[0])).toBe('http://localhost/v1/audio/speech')
  const request = fetch.mock.calls[0]?.[1] as RequestInit
  expect(new Headers(request.headers).get('Authorization')).toBe('Bearer audio-key')
  expect(JSON.parse(String(request.body))).toEqual({ model: 'local-tts', voice: 'vi', input: 'Xin chào', response_format: 'wav' })
  expect(spawn).toHaveBeenCalledWith('pw-play', [expect.stringMatching(/answer\.wav$/)], expect.objectContaining({ stdio: 'ignore' }))
})

it('does not play failed speech responses or disclose the provider body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private provider error', { status: 401 })))
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  await expect(voice.speak('Hello', new AbortController().signal)).rejects.toThrow(`${cliMessages.en.voiceFailed} HTTP 401`)
  expect(spawn).not.toHaveBeenCalled()
})

it('transcribes a captured WAV and sends the selected STT model', async () => {
  let recorded: Promise<void> = Promise.resolve()
  spawn.mockImplementation((_command: string, args: string[]) => {
    const child = new EventEmitter()
    recorded = writeFile(args.at(-1)!, new Uint8Array([82, 73, 70, 70]))
    Object.assign(child, { kill: () => {
      queueMicrotask(() => child.emit('close', 0, null))
    } })
    return child
  })
  const fetch = vi.fn(async (_url: URL, _init: RequestInit) => Response.json({ text: '  Mở ứng dụng  ' }))
  vi.stubGlobal('fetch', fetch)
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1', ANGELA_STT_MODEL: 'local-stt' }, cliMessages.en)
  const result = await voice.listen(async () => {
    await recorded
    return ''
  }, new AbortController().signal)
  expect(result).toBe('Mở ứng dụng')
  expect(String(fetch.mock.calls[0]?.[0])).toBe('http://localhost/v1/audio/transcriptions')
  const body = fetch.mock.calls[0]?.[1].body as FormData
  expect(body.get('model')).toBe('local-stt')
  expect(body.get('file')).toBeInstanceOf(Blob)
})
