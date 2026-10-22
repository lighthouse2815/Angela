import process from 'node:process'

import { Buffer } from 'node:buffer'
import { EventEmitter, once } from 'node:events'
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { EchoCancellation } from './echo-cancellation'
import { Voice } from './voice'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))

const servers: WebSocketServer[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const socket of server.clients)
      socket.terminate()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  spawn.mockReset()
})

it('requires an explicit audio endpoint before voice mode starts', () => {
  expect(() => new Voice({}, cliMessages.en)).toThrow(cliMessages.en.voiceConfig)
  expect(() => new Voice({ ANGELA_VOICE_BASE_URL: 'file:///tmp/audio' }, cliMessages.en)).toThrow(cliMessages.en.voiceConfig)
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

it('loads voice configuration outside the workspace and lets environment values override it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-voice-config-'))
  try {
    const path = join(directory, 'voice.env')
    await writeFile(path, 'ANGELA_VOICE_BASE_URL=http://localhost:8000/v1/\nANGELA_TTS_MODEL=edge-tts\n')
    const voice = await Voice.load({ ANGELA_VOICE_ENV: path, ANGELA_VOICE_BASE_URL: 'http://localhost:9000/v1/' }, cliMessages.en)
    const fetch = vi.fn(async (_url: URL, _init: RequestInit) => new Response('denied', { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    await expect(voice.speak('Xin chào', new AbortController().signal)).rejects.toThrow('HTTP 401')
    expect(String(fetch.mock.calls[0]?.[0])).toBe('http://localhost:9000/v1/audio/speech')
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body)).model).toBe('edge-tts')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('splits long replies without losing text and stops future chunks on cancellation', async () => {
  const controller = new AbortController()
  const fetch = vi.fn(async (_url: URL, _init: RequestInit) => new Response(new Uint8Array([82, 73, 70, 70])))
  vi.stubGlobal('fetch', fetch)
  spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  const text = 'Xin chào Angela. '.repeat(800)
  await voice.speak(text, controller.signal)
  const chunks = fetch.mock.calls.map(([, request]) => JSON.parse(String(request.body)).input as string)
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.join('')).toBe(text)
  expect(chunks.every(chunk => chunk.length <= 1801)).toBe(true)
  fetch.mockClear()
  spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => {
      controller.abort()
      child.emit('close', 0)
    })
    return child
  })
  await expect(voice.speak(text, controller.signal)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})

async function endpoint(env: NodeJS.ProcessEnv = {}) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  servers.push(server)
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test port')
  return { server, voice: new Voice({ ANGELA_VOICE_BASE_URL: `http://127.0.0.1:${address.port}/v1/`, ANGELA_STT_MODEL: 'small', ...env }, cliMessages.en) }
}

function microphone() {
  const child = new EventEmitter()
  const stdout = new PassThrough()
  const kill = vi.fn(() => {
    queueMicrotask(() => child.emit('close', 1, null))
  })
  Object.assign(child, { stdout, kill })
  spawn.mockReturnValue(child)
  return { child, stdout, kill }
}

function pendingCommand(signal: AbortSignal): Promise<string | undefined> {
  return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
}

it('streams raw audio and stops the microphone before transcription, then returns the utterance', async () => {
  const { server, voice } = await endpoint()
  const mic = microphone()
  const frames: Buffer[] = []
  const states: string[] = []
  server.on('connection', (socket, request) => {
    expect(request.url).toBe('/v1/audio/listen')
    socket.on('message', (data, binary) => {
      if (!binary) {
        expect(JSON.parse(data.toString())).toEqual({ model: 'small' })
        socket.send(JSON.stringify({ type: 'ready' }))
      }
      else {
        frames.push(Buffer.from(data.toString()))
        socket.send(JSON.stringify({ type: 'speech' }))
        socket.send(JSON.stringify({ type: 'transcribing' }))
        socket.send(JSON.stringify({ type: 'transcript', text: 'Mở ứng dụng' }))
      }
    })
  })
  const result = await voice.listen(pendingCommand, new AbortController().signal, (state) => {
    states.push(state)
    if (state === 'ready')
      setImmediate(() => mic.stdout.write(Buffer.from('audio')))
    if (state === 'transcribing')
      expect(mic.kill).toHaveBeenCalled()
  })
  expect(result).toEqual({ kind: 'transcript', text: 'Mở ứng dụng' })
  expect(states).toEqual(['ready', 'speech', 'transcribing'])
  expect(frames).toEqual([Buffer.from('audio')])
  expect(spawn).toHaveBeenCalledWith('pw-record', expect.arrayContaining(['--raw', '-']), expect.objectContaining({ stdio: ['ignore', 'pipe', 'ignore'] }))
})

it('lets /chat discard a capture and closes the microphone', async () => {
  const { server, voice } = await endpoint()
  const mic = microphone()
  let sendCommand: ((value: string) => void) | undefined
  server.on('connection', socket => socket.once('message', () => socket.send(JSON.stringify({ type: 'ready' }))))
  const result = await voice.listen(() => new Promise<string>(resolve => sendCommand = resolve), new AbortController().signal, () => sendCommand?.('/chat'))
  expect(result).toEqual({ kind: 'command', text: '/chat' })
  expect(mic.kill).toHaveBeenCalledWith('SIGINT')
})

it('cancels listening without leaving a terminal question or microphone running', async () => {
  const { server, voice } = await endpoint()
  const mic = microphone()
  const controller = new AbortController()
  let question: AbortSignal | undefined
  server.on('connection', socket => socket.once('message', () => socket.send(JSON.stringify({ type: 'ready' }))))
  await expect(voice.listen((signal) => {
    question = signal
    return pendingCommand(signal)
  }, controller.signal, () => controller.abort())).rejects.toThrow()
  expect(question?.aborted).toBe(true)
  expect(mic.kill).toHaveBeenCalledWith('SIGINT')
})

it('rejects service disconnects and cancels the pending terminal question', async () => {
  const { server, voice } = await endpoint()
  let question: AbortSignal | undefined
  server.on('connection', socket => socket.close())
  await expect(voice.listen((signal) => {
    question = signal
    return pendingCommand(signal)
  }, new AbortController().signal, () => {})).rejects.toThrow(cliMessages.en.voiceFailed)
  expect(question?.aborted).toBe(true)
  expect(spawn).not.toHaveBeenCalled()
})

it('treats an unexpected recorder exit as a failure instead of sending partial audio', async () => {
  const { server, voice } = await endpoint()
  const mic = microphone()
  server.on('connection', socket => socket.once('message', () => socket.send(JSON.stringify({ type: 'ready' }))))
  await expect(voice.listen(pendingCommand, new AbortController().signal, () => {
    setImmediate(() => mic.child.emit('close', 1, null))
  })).rejects.toThrow(cliMessages.en.voiceFailed)
})

it('cleans only stale audio, preserving active owners, recent files, and unrelated content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'angela-audio-cleanup-'))
  const old = new Date(Date.now() - 2 * 86_400_000)
  try {
    for (const name of ['angela-voice-stale', 'angela-voice-empty', 'angela-voice-active', 'angela-voice-recent', 'angela-voice-unrelated', 'other-app']) {
      const directory = join(root, name)
      await mkdir(directory)
      if (name !== 'angela-voice-empty')
        await writeFile(join(directory, 'answer.wav'), 'audio')
      if (name === 'angela-voice-active')
        await writeFile(join(directory, 'owner.json'), JSON.stringify({ pid: process.pid }))
      if (name === 'angela-voice-unrelated')
        await writeFile(join(directory, 'notes.txt'), 'keep')
      if (name !== 'angela-voice-recent')
        await utimes(directory, old, old)
    }
    expect(await Voice.cleanupTemporaryAudio(root)).toEqual({ removed: 2 })
    expect((await readdir(root)).sort()).toEqual(['angela-voice-active', 'angela-voice-recent', 'angela-voice-unrelated', 'other-app'])
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('creates private local configuration once and preserves customized endpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'angela-voice-settings-'))
  const env = { ANGELA_VOICE_ENV: join(root, 'voice.env') }
  try {
    await Voice.configureLocal(env)
    expect(await readFile(env.ANGELA_VOICE_ENV, 'utf8')).toContain('ANGELA_STT_MODEL=small')
    await writeFile(env.ANGELA_VOICE_ENV, 'ANGELA_VOICE_BASE_URL=http://localhost:9000/v1/\n')
    await Voice.configureLocal(env)
    expect(await readFile(env.ANGELA_VOICE_ENV, 'utf8')).toBe('ANGELA_VOICE_BASE_URL=http://localhost:9000/v1/\n')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('checks endpoint readiness without starting capture or exposing invalid response bodies', async () => {
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  const fetch = vi.fn(async () => Response.json({ status: 'ok' }))
  vi.stubGlobal('fetch', fetch)
  expect(await voice.healthy()).toBe(true)
  fetch.mockImplementation(async () => new Response('private upstream error', { status: 502 }))
  expect(await voice.healthy()).toBe(false)
  expect(spawn).not.toHaveBeenCalled()
})

it('routes recording and playback to the configured devices without shell expansion', async () => {
  const source = 'microphone name $(touch /tmp/not-executed)'
  const sink = 'speaker name; echo ignored'
  const { server, voice } = await endpoint({ ANGELA_VOICE_SOURCE: source, ANGELA_VOICE_SINK: sink })
  const mic = microphone()
  server.on('connection', socket => socket.once('message', () => socket.send(JSON.stringify({ type: 'ready' }))))
  await voice.listen(async () => {
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled())
    return '/chat'
  }, new AbortController().signal, () => {})
  expect(spawn).toHaveBeenCalledWith('pw-record', ['--target', source, '--raw', '--rate', '16000', '--channels', '1', '--format', 's16', '-'], expect.any(Object))
  expect(mic.kill).toHaveBeenCalledWith('SIGINT')

  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([82, 73, 70, 70]))))
  spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
  await voice.speak('Xin chào', new AbortController().signal)
  expect(spawn).toHaveBeenLastCalledWith('pw-play', ['--target', sink, expect.stringMatching(/answer\.wav$/)], expect.objectContaining({ stdio: 'ignore' }))
})

it('creates an owned echo filter for default voice mode and releases it before reuse', async () => {
  const start = vi.spyOn(EchoCancellation.prototype, 'start').mockResolvedValue()
  const close = vi.spyOn(EchoCancellation.prototype, 'close').mockResolvedValue()
  vi.spyOn(EchoCancellation.prototype, 'active', 'get').mockReturnValue(true)
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  await voice.start(new AbortController().signal)
  await voice.start(new AbortController().signal)
  expect(start).toHaveBeenCalledTimes(1)
  expect(voice.canInterrupt).toBe(true)
  await voice.close()
  expect(close).toHaveBeenCalledTimes(1)
  expect(voice.canInterrupt).toBe(false)
})

it('preserves explicit device selection and headphone or turn-based modes', async () => {
  const start = vi.spyOn(EchoCancellation.prototype, 'start').mockResolvedValue()
  for (const settings of [
    { ANGELA_VOICE_SOURCE: 'source' },
    { ANGELA_VOICE_SINK: 'sink' },
    { ANGELA_VOICE_BARGE_IN: '0' },
    { ANGELA_VOICE_BARGE_IN: '1' },
  ]) {
    const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/', ...settings }, cliMessages.en)
    await voice.start(new AbortController().signal)
    await voice.close()
  }
  expect(start).not.toHaveBeenCalled()
})

it('keeps separate turns after filter creation fails and retains ownership for cleanup', async () => {
  vi.spyOn(EchoCancellation.prototype, 'start').mockRejectedValue(new Error('No echo filter'))
  const close = vi.spyOn(EchoCancellation.prototype, 'close').mockResolvedValue()
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  await expect(voice.start(new AbortController().signal)).rejects.toThrow('No echo filter')
  expect(voice.canInterrupt).toBe(false)
  await voice.close()
  expect(close).toHaveBeenCalledTimes(1)
})
