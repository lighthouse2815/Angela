import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { FacePerceptionProvider, RawFaceObservation } from './observation'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createContext } from '@moeru/eventa'

import * as v from 'valibot'

import { faceObservation, workerEventSchema } from './observation'

/** Runtime selection does not enable the camera. Only an explicit start opens a device. */
export function readCameraConfig(env: NodeJS.ProcessEnv) {
  const upstream = env.ANGELA_OPENSEEFACE_DIR ?? fileURLToPath(new URL('../../../../third_party/openseeface/', import.meta.url))
  const runtime = fileURLToPath(new URL('../../python/camera-worker/', import.meta.url))
  const bundled = join(runtime, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
  const integer = (value: string | undefined, fallback: number, minimum: number, maximum: number) => v.parse(v.pipe(v.number(), v.integer(), v.minValue(minimum), v.maxValue(maximum)), Number(value ?? fallback))
  return {
    python: env.ANGELA_CAMERA_PYTHON ?? (existsSync(bundled) ? bundled : 'python3'),
    worker: fileURLToPath(new URL('../../python/camera-worker/worker.py', import.meta.url)),
    upstream,
    device: integer(env.ANGELA_CAMERA_DEVICE, 0, 0, 99),
    fps: integer(env.ANGELA_CAMERA_FPS, 10, 1, 30),
  }
}

/**
 * Owns one Python child. OFF -> STARTING -> ON or ERROR. Errors require an explicit new start, with zero automatic retries.
 * stop cancels startup, waits for close, and escalates to SIGKILL after one second. Duplicate starts share readiness.
 * JSONL is the user-requested Python boundary. The strict envelope lives in observation.ts and worker.py.
 */
export class OpenSeeFaceProvider implements FacePerceptionProvider {
  private child?: ChildProcessWithoutNullStreams
  private latest?: RawFaceObservation
  private readonly events = createContext()
  private state: FacePerceptionProvider['status']['state'] = 'off'
  private error?: string
  private invalidEvents = 0
  private starting?: Promise<void>
  private stopping?: Promise<void>
  private closed?: Promise<void>
  private startupTimer?: ReturnType<typeof setTimeout>
  private watchdog?: ReturnType<typeof setInterval>
  private lastReceived = 0
  private rejectStart?: (error: Error) => void

  constructor(private readonly config: ReturnType<typeof readCameraConfig>) {}

  get status(): FacePerceptionProvider['status'] {
    return { state: this.state, error: this.error, invalidEvents: this.invalidEvents }
  }

  getLatestObservation() {
    // An observation loses authority when the stream stops or its receipt is older than two seconds.
    return this.state === 'on' && Date.now() - this.lastReceived <= 2000 ? this.latest : undefined
  }

  subscribe(listener: (observation: RawFaceObservation) => void) {
    return this.events.on(faceObservation, ({ body }) => {
      if (body)
        listener(body)
    })
  }

  start(): Promise<void> {
    if (this.stopping)
      return this.stopping.then(() => this.start())
    if (this.starting)
      return this.starting
    if (this.state === 'on')
      return Promise.resolve()
    this.state = 'starting'
    this.error = undefined
    this.invalidEvents = 0
    this.latest = undefined
    const child = spawn(this.config.python, ['-u', this.config.worker, '--upstream', this.config.upstream, '--device', String(this.config.device), '--fps', String(this.config.fps)], { stdio: 'pipe', windowsHide: true })
    this.child = child
    this.closed = new Promise(resolve => child.once('close', () => resolve()))
    // Drain diagnostics without retaining or echoing arbitrary third-party output into chat logs.
    child.stderr.resume()
    child.stdin.on('error', () => {})
    this.starting = new Promise<void>((resolve, reject) => {
      this.rejectStart = reject
      this.startupTimer = setTimeout(() => this.fail('startup_timeout'), 30_000)
      child.once('error', () => this.fail('python_unavailable'))
      child.once('close', () => {
        if (this.state !== 'off' && this.state !== 'error')
          this.fail('worker_exited')
        this.clearTimers()
        this.latest = undefined
        this.child = undefined
      })
      let buffer = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (this.state === 'off' || this.state === 'error')
          return
        buffer += chunk
        // Bound both complete lines and partial writes before JSON parsing.
        if (buffer.length > 64 * 1024) {
          this.fail('protocol_error')
          return
        }
        let end = buffer.indexOf('\n')
        while (end !== -1) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 1)
          try {
            const parsed = v.safeParse(workerEventSchema, JSON.parse(line))
            if (!parsed.success) {
              this.invalidEvents++
            }
            else {
              const event = parsed.output
              if (event.type === 'error') {
                this.fail(event.code)
                return
              }
              if (event.type === 'ready' && this.state === 'starting') {
                clearTimeout(this.startupTimer)
                this.state = 'on'
                this.lastReceived = Date.now()
                this.watchdog = setInterval(() => {
                  if (Date.now() - this.lastReceived > 5000)
                    this.fail('stream_timeout')
                }, 1000)
                this.watchdog.unref()
                resolve()
              }
              else if (event.type === 'face_observation' && this.state === 'on') {
                const now = Date.now()
                if (event.timestamp <= now + 250 && now - event.timestamp <= 2000 && (!this.latest || event.timestamp > this.latest.timestamp)) {
                  this.lastReceived = now
                  this.latest = event
                  this.events.emit(faceObservation, event)
                }
                else {
                  this.invalidEvents++
                }
              }
            }
          }
          catch {
            this.invalidEvents++
          }
          if (this.invalidEvents >= 10) {
            this.fail('protocol_error')
            return
          }
          end = buffer.indexOf('\n')
        }
      })
    }).finally(() => {
      this.starting = undefined
      this.rejectStart = undefined
    })
    return this.starting
  }

  private clearTimers() {
    clearTimeout(this.startupTimer)
    clearInterval(this.watchdog)
  }

  private fail(code: string) {
    if (this.state === 'off' || this.state === 'error')
      return
    this.state = 'error'
    this.error = code
    this.latest = undefined
    this.rejectStart?.(new Error(code))
    this.clearTimers()
    void this.terminate()
  }

  private terminate(): Promise<void> {
    if (this.stopping)
      return this.stopping
    const child = this.child
    const closed = this.closed
    if (!child || !closed)
      return Promise.resolve()
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 1000)
    this.stopping = closed.finally(() => {
      clearTimeout(timer)
      this.stopping = undefined
    })
    return this.stopping
  }

  async stop() {
    this.state = 'off'
    this.error = undefined
    this.latest = undefined
    this.rejectStart?.(new Error('camera_stopped'))
    this.clearTimers()
    await this.terminate()
  }
}
