import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { ChildProcess, spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
