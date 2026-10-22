import type { FacePerceptionProvider } from './observation'

import { cliMessages } from '@angela/i18n/cli'

import { AffectEngine } from './affect-engine'
import { CameraContextProvider } from './camera-context'
import { OpenSeeFaceProvider, readCameraConfig } from './openseeface-provider'

/** Session-owned opt-in camera. Construction, help, status, debug, and OFF never spawn a worker or access a device. */
export class Camera {
  private provider?: FacePerceptionProvider
  private engine = new AffectEngine()
  private readonly context = new CameraContextProvider()
  private unsubscribe?: () => void
  private lastError?: string
  private noticedError?: string

  constructor(private readonly env: NodeJS.ProcessEnv, private readonly messages = cliMessages.en) {}

  get enabled() {
    return this.provider?.status.state === 'on'
  }

  /** The input loop prints health changes between prompts, preserving text that the user is typing. */
  takeNotice() {
    const error = this.provider?.status.error ?? this.lastError
    if (!error || error === this.noticedError)
      return undefined
    this.noticedError = error
    return `${this.messages.cameraFailure} (${error})`
  }

  /** Context exists only while the current worker is healthy. Re-enabling always starts a fresh temporal window. */
  getContext() {
    if (!this.enabled)
      return undefined
    return this.context.getContext(this.engine.getState())
  }

  async command(text: string, signal?: AbortSignal): Promise<string | undefined> {
    if (text !== '/camera' && !text.startsWith('/camera '))
      return undefined
    const action = text.slice('/camera'.length).trim() || 'status'
    if (action === 'off') {
      await this.close()
      return this.messages.cameraOff
    }
    if (action === 'status' || action === 'debug') {
      const status = this.provider?.status
      const label = this.enabled ? this.messages.cameraOn : this.messages.cameraOff
      const error = status?.error ?? this.lastError
      const health = error ? `\n${this.messages.cameraFailure} (${error})` : ''
      if (action === 'status')
        return `${label}${health}`
      return `${label}${health}\n${this.messages.cameraDebug}\n${JSON.stringify({ worker: status?.state ?? 'off', invalidEvents: status?.invalidEvents ?? 0, affect: this.enabled ? this.engine.getState() : undefined, metrics: this.provider?.getLatestObservation()?.metrics }, null, 2)}`
    }
    if (action !== 'on')
      return this.messages.cameraUsage
    if (this.enabled)
      return this.messages.cameraOn
    const abort = () => {
      void this.close()
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      signal?.throwIfAborted()
      await this.close()
      signal?.throwIfAborted()
      const config = readCameraConfig(this.env)
      this.engine = new AffectEngine({ windowMs: Number(this.env.ANGELA_CAMERA_WINDOW_MS ?? 1000), sampleGapMs: Math.max(500, Math.ceil(2000 / config.fps)) })
      this.provider = new OpenSeeFaceProvider(config)
      this.unsubscribe = this.provider.subscribe(observation => this.engine.observe(observation))
      await this.provider.start()
      signal?.throwIfAborted()
      if (!this.enabled)
        throw new Error('worker_exited')
      return this.messages.cameraOn
    }
    catch {
      if (signal?.aborted) {
        await this.close()
        return this.messages.cameraOff
      }
      const code = this.provider?.status.error ?? 'configuration_or_python'
      this.lastError = code
      this.noticedError = code
      await this.provider?.stop()
      this.unsubscribe?.()
      this.unsubscribe = undefined
      this.engine.reset()
      this.context.reset()
      return `${this.messages.cameraFailure} (${code})`
    }
    finally {
      signal?.removeEventListener('abort', abort)
    }
  }

  async close() {
    this.lastError = undefined
    this.noticedError = undefined
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.engine.reset()
    this.context.reset()
    await this.provider?.stop()
  }
}
