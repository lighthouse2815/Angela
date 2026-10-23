import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

/** Owns one PipeWire echo filter. Unique names prevent unloading another session's module after an audio-server restart. */
export class EchoCancellation {
  readonly source = `angela_echo_source_${randomUUID().replaceAll('-', '')}`
  readonly sink = `${this.source}_sink`
  private attempted = false
  private ready = false

  constructor(private readonly env: NodeJS.ProcessEnv) {}

  get active() {
    return this.ready
  }

  /** Creates virtual devices without changing system defaults. Failed or cancelled loads are also searched during cleanup. */
  async start(signal: AbortSignal) {
    if (this.ready)
      return
    signal.throwIfAborted()
    this.attempted = true
    try {
      await promisify(execFile)('pactl', ['load-module', 'module-echo-cancel', `source_name=${this.source}`, `sink_name=${this.sink}`, 'aec_method=webrtc'], { env: this.env, signal, timeout: 10_000 })
      signal.throwIfAborted()
      this.ready = true
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        this.attempted = false
      await this.close()
      throw error
    }
  }

  /** Removes only modules with this instance's exact device pair. A recycled module ID is never sufficient. */
  async close() {
    if (!this.attempted)
      return
    this.ready = false
    const { stdout } = await promisify(execFile)('pactl', ['list', 'short', 'modules'], { env: this.env, timeout: 5000 })
    for (const line of stdout.split('\n')) {
      const [id, name, argument] = line.split('\t')
      const args = argument?.split(/\s+/u)
      if (id && /^\d+$/u.test(id) && name === 'module-echo-cancel' && args?.includes(`source_name=${this.source}`) && args.includes(`sink_name=${this.sink}`))
        await promisify(execFile)('pactl', ['unload-module', id], { env: this.env, timeout: 5000 })
    }
    this.attempted = false
  }
}
