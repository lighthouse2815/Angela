import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import { ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Chat } from '../chat'
import { Sessions } from '../sessions'
import { Camera } from './camera'
import { OpenSeeFaceProvider, readCameraConfig } from './openseeface-provider'

vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn() }
})

let child: ChildProcessWithoutNullStreams
let provider: OpenSeeFaceProvider
let closeOnTerminate: boolean

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  closeOnTerminate = true
  vi.mocked(spawn).mockReset().mockImplementation(() => {
    const process = new ChildProcess()
    process.stdin = new PassThrough()
    process.stdout = new PassThrough()
    process.stderr = new PassThrough()
    const next = process as ChildProcessWithoutNullStreams
    next.kill = vi.fn((signal) => {
      if (closeOnTerminate || signal === 'SIGKILL')
        queueMicrotask(() => next.emit('close', 0))
      return true
    })
    child = next
    return next
  })
  provider = new OpenSeeFaceProvider(readCameraConfig({ ANGELA_CAMERA_PYTHON: 'camera-python' }))
})

afterEach(async () => {
  closeOnTerminate = true
  await provider.stop()
  vi.useRealTimers()
})

function event(value: object) {
  child.stdout.emit('data', `${JSON.stringify(value)}\n`)
}

async function start() {
  const ready = provider.start()
  event({ type: 'ready' })
  await ready
}

function observation(timestamp = Date.now()) {
  return { type: 'face_observation', timestamp, faceDetected: true, confidence: 0.9, features: { smileLike: 0.8, mouthOpen: 0.1 }, headPose: { yaw: 2, pitch: 1, roll: 0 } }
}

function completion(delta: object, finishReason = 'stop') {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

async function enableCamera() {
  const camera = new Camera({}, cliMessages.en)
  const starting = camera.command('/camera on')
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
  event({ type: 'ready' })
  await starting
  for (let time = 10_000; time <= 14_000; time += 100) {
    vi.setSystemTime(time)
    event(observation(time))
  }
  return camera
}

function requestOptions(chat: Chat, model: GenerationProvider, camera: Camera, tools: Tool[] = []): StreamOptions {
  const persona = chat.conversation.turns.filter(turn => turn.type === 'system').flatMap(turn => turn.content).flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
  return {
    tools,
    resolveStep: async () => ({ model: 'test', chatProvider: model, providerId: 'test', systemPrompt: [persona, camera.getContext()].filter(Boolean).join('\n\n'), tools }),
  }
}

describe('openSeeFace process boundary', () => {
  it('waits for readiness, shares duplicate starts, publishes latest valid observation, and stops cleanly', async () => {
    expect(provider.status.state).toBe('off')
    expect(spawn).not.toHaveBeenCalled()
    const listener = vi.fn()
    const unsubscribe = provider.subscribe(listener)
    const first = provider.start()
    expect(provider.start()).toBe(first)
    expect(provider.status.state).toBe('starting')
    event({ type: 'ready' })
    await first
    const payload = observation()
    const encoded = JSON.stringify(payload)
    child.stdout.emit('data', encoded.slice(0, 20))
    child.stdout.emit('data', `${encoded.slice(20)}\n`)
    expect(provider.status.state).toBe('on')
    expect(provider.getLatestObservation()).toEqual(payload)
    expect(listener).toHaveBeenCalledWith(payload)
    unsubscribe()
    vi.setSystemTime(10_100)
    event(observation())
    expect(listener).toHaveBeenCalledOnce()
    await provider.start()
    expect(spawn).toHaveBeenCalledOnce()
    await provider.stop()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(provider.status.state).toBe('off')
    expect(provider.getLatestObservation()).toBeUndefined()
  })

  it('ignores malformed, sensitive, replayed, stale, and future events without crashing', async () => {
    await start()
    child.stdout.emit('data', 'not json\n')
    event({ ...observation(), image: 'raw' })
    event(observation())
    event(observation())
    event(observation(100))
    event(observation(20_000))
    expect(provider.status.invalidEvents).toBe(5)
    expect(provider.getLatestObservation()).toEqual(observation())
    expect(provider.status.state).toBe('on')
  })

  it('bounds malformed event counts and partial protocol lines', async () => {
    await start()
    for (let index = 0; index < 10; index++)
      child.stdout.emit('data', 'bad\n')
    expect(provider.status).toMatchObject({ state: 'error', error: 'protocol_error', invalidEvents: 10 })
    await provider.stop()
    await start()
    child.stdout.emit('data', 'x'.repeat(65_537))
    expect(provider.status.error).toBe('protocol_error')
  })

  it('reports missing Python and worker diagnostics with no retry loop', async () => {
    const starting = provider.start()
    const rejected = expect(starting).rejects.toThrow('python_unavailable')
    child.emit('error', new Error('ENOENT'))
    await rejected
    await vi.advanceTimersByTimeAsync(60_000)
    expect(spawn).toHaveBeenCalledOnce()
    expect(provider.status.state).toBe('error')
    await provider.stop()
    const retry = provider.start()
    const failure = expect(retry).rejects.toThrow('dependencies_missing')
    event({ type: 'error', code: 'dependencies_missing' })
    await failure
  })

  it('detects crash and stalled streams, and expires latest observations', async () => {
    await start()
    event(observation())
    vi.setSystemTime(12_001)
    expect(provider.getLatestObservation()).toBeUndefined()
    child.emit('close', 1)
    expect(provider.status.error).toBe('worker_exited')
    await provider.stop()
    await start()
    await vi.advanceTimersByTimeAsync(6000)
    expect(provider.status.error).toBe('stream_timeout')
    expect(provider.getLatestObservation()).toBeUndefined()
  })

  it('times out startup and escalates a hung shutdown', async () => {
    closeOnTerminate = false
    const starting = provider.start()
    const rejected = expect(starting).rejects.toThrow('startup_timeout')
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
    await vi.advanceTimersByTimeAsync(1000)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('cancels startup and ignores output after OFF', async () => {
    const starting = provider.start()
    const rejected = expect(starting).rejects.toThrow('camera_stopped')
    await provider.stop()
    await rejected
    event({ type: 'ready' })
    event(observation())
    expect(provider.status.state).toBe('off')
    expect(provider.getLatestObservation()).toBeUndefined()
  })
})

describe('session camera commands', () => {
  it('keeps camera OFF by default and does not spawn for status, debug, off, or unrelated commands', async () => {
    const camera = new Camera({}, cliMessages.en)
    expect(await camera.command('/camera status')).toContain('OFF')
    expect(await camera.command('/camera debug')).toContain('"worker": "off"')
    expect(await camera.command('/camera off')).toContain('OFF')
    expect(await camera.command('/camera invalid')).toBe(cliMessages.en.cameraUsage)
    expect(await camera.command('/help')).toBeUndefined()
    expect(camera.getContext()).toBeUndefined()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('controls the real provider and keeps failures isolated from conversation', async () => {
    const camera = new Camera({ ANGELA_CAMERA_PYTHON: 'camera-python' }, cliMessages.en)
    const starting = camera.command('/camera on')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    event({ type: 'ready' })
    expect(await starting).toContain('ON')
    expect(await camera.command('/camera on')).toContain('ON')
    for (let time = 10_000; time <= 14_000; time += 100) {
      vi.setSystemTime(time)
      event(observation(time))
    }
    expect(camera.getContext()).toContain('expression=smile')
    expect(await camera.command('/camera debug')).toContain('"expression": "smile"')
    child.emit('close', 1)
    expect(camera.getContext()).toBeUndefined()
    expect(camera.takeNotice()).toContain('worker_exited')
    expect(camera.takeNotice()).toBeUndefined()
    expect(await camera.command('/camera status')).toContain('worker_exited')
    await camera.close()
    expect(await camera.command('/camera status')).toContain('OFF')
  })

  it('reports invalid runtime configuration and worker startup errors without throwing', async () => {
    const invalid = new Camera({ ANGELA_CAMERA_FPS: '0' }, cliMessages.en)
    expect(await invalid.command('/camera on')).toContain(cliMessages.en.cameraFailure)
    expect(spawn).not.toHaveBeenCalled()
    const camera = new Camera({}, cliMessages.en)
    const starting = camera.command('/camera on')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    event({ type: 'error', code: 'camera_unavailable' })
    expect(await starting).toContain('camera_unavailable')
    expect(await camera.command('/camera debug')).toContain('camera_unavailable')
    expect(camera.enabled).toBe(false)
    expect(camera.getContext()).toBeUndefined()
    await camera.close()
  })

  it('cancels an in-progress enable command and leaves no process or context', async () => {
    const camera = new Camera({}, cliMessages.en)
    const controller = new AbortController()
    const starting = camera.command('/camera on', controller.signal)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    controller.abort()
    expect(await starting).toBe(cliMessages.en.cameraOff)
    expect(camera.enabled).toBe(false)
    expect(camera.getContext()).toBeUndefined()
    expect(camera.takeNotice()).toBeUndefined()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await camera.close()
  })

  it('does not report ON when a worker exits immediately after readiness', async () => {
    const camera = new Camera({}, cliMessages.en)
    const starting = camera.command('/camera on')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    event({ type: 'ready' })
    child.emit('close', 1)
    expect(await starting).toContain('worker_exited')
    expect(camera.enabled).toBe(false)
    await camera.close()
  })
})

describe('request-only camera context', () => {
  it('sends stable cues on consecutive user requests without retaining them in sessions or creating memory files', async () => {
    const camera = await enableCamera()
    const directory = await mkdtemp(join(tmpdir(), 'angela-camera-context-'))
    const session = await new Sessions(directory, cliMessages.en).open('/workspace')
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => completion({ role: 'assistant', content: 'Here is another example.' }))
      const model: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'http://model.example/v1/', fetch } }) }
      const chat = new Chat('test', model, '/workspace')
      const options = requestOptions(chat, model, camera)
      expect(fetch).not.toHaveBeenCalled()
      for (const text of ['First question', 'Next question', 'One more question'])
        await chat.send(text, options, 'Task context: pending study reminder')
      expect(fetch).toHaveBeenCalledTimes(3)
      for (const [, init] of fetch.mock.calls) {
        const body = String(init?.body)
        expect(body).toContain('face_present=true, expression=smile, attention=screen')
        expect(body).toContain('Task context: pending study reminder')
        expect(body).not.toContain('smileLike')
        expect(body).not.toContain('headPose')
        expect(body).not.toContain('image_url')
      }
      expect(String(fetch.mock.calls[1][1]?.body)).toContain('camera_reaction=quiet')
      expect(JSON.stringify(chat.conversation)).not.toContain('Visual context')
      await session.save(chat.conversation, false)
      const saved = await readFile(join(directory, `${session.record.id}.json`), 'utf8')
      expect(saved).not.toContain('Visual context')
      expect(saved).not.toContain('camera_reaction')
      expect(saved).not.toContain('smileLike')
      expect(await readdir(directory)).toEqual([`${session.record.id}.json`, `${session.record.id}.lock`])
      await camera.close()
      await chat.send('Continue with camera off', options)
      expect(String(fetch.mock.calls[3][1]?.body)).not.toContain('Visual context')
    }
    finally {
      await camera.close()
      await session.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['unchanged', 'changed', 'stale', 'off'] as const)('reads current camera state after a tool call: %s', async (transition) => {
    const camera = await enableCamera()
    try {
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(completion({ role: 'assistant', tool_calls: [{ index: 0, id: 'step-1', type: 'function', function: { name: 'next_step', arguments: '{}' } }] }, 'tool_calls'))
        .mockResolvedValueOnce(completion({ role: 'assistant', content: 'Here is the next step.' }))
      const model: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'http://model.example/v1/', fetch } }) }
      const chat = new Chat('test', model, '/workspace')
      const tools: Tool[] = [{
        type: 'function',
        function: { name: 'next_step', description: 'Read the next study step.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } },
        execute: async () => {
          if (transition === 'off') {
            await camera.close()
          }
          else if (transition === 'stale') {
            vi.setSystemTime(17_000)
          }
          else if (transition === 'changed') {
            for (let time = 14_100; time <= 18_000; time += 100) {
              vi.setSystemTime(time)
              event({ ...observation(time), headPose: { yaw: 40, pitch: 0, roll: 0 }, features: { smileLike: 0.05, mouthOpen: 0.1 } })
            }
          }
          return 'Next step is available.'
        },
      }]
      await chat.send('Explain the next step', requestOptions(chat, model, camera, tools), 'Task context: pending study reminder')
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(String(fetch.mock.calls[0][1]?.body)).toContain('expression=smile, attention=screen')
      const continuation = String(fetch.mock.calls[1][1]?.body)
      expect(continuation).toContain('Task context: pending study reminder')
      if (transition === 'off' || transition === 'stale') {
        expect(continuation).not.toContain('Visual context')
      }
      else {
        expect(continuation).toContain('camera_reaction=quiet')
        expect(continuation).toContain(transition === 'changed' ? 'expression=neutral, attention=away' : 'expression=smile, attention=screen')
      }
      expect(JSON.stringify(chat.conversation)).not.toContain('Visual context')
    }
    finally {
      await camera.close()
    }
  })
})
