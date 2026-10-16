import type { cliMessages } from '@proj-airi/i18n/cli'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

/** Owns private audio files, PipeWire children, and one serial audio request at a time. */
export class Voice {
  private readonly baseUrl: URL

  /** Reads device-local audio configuration. Process environment values override the file. */
  static async load(env: NodeJS.ProcessEnv, messages: typeof cliMessages.en) {
    const path = env.ANGELA_VOICE_ENV ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'voice.env')
    let saved: NodeJS.ProcessEnv | undefined
    try {
      saved = parseEnv(await readFile(path, 'utf8'))
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || env.ANGELA_VOICE_ENV)
        throw error
    }
    return new Voice({ ...saved, ...env }, messages)
  }

  constructor(private readonly env: NodeJS.ProcessEnv, private readonly messages: typeof cliMessages.en) {
    if (process.platform !== 'linux')
      throw new Error(messages.voicePlatform)
    if (!env.ANGELA_VOICE_BASE_URL)
      throw new Error(messages.voiceConfig)
    this.baseUrl = new URL(`${env.ANGELA_VOICE_BASE_URL.replace(/\/+$/, '')}/`)
    if (!['http:', 'https:'].includes(this.baseUrl.protocol))
      throw new Error(messages.voiceConfig)
  }

  /** Enter stops capture. EOF or a command discards it. Cancellation terminates the child and deletes audio. */
  async listen(stop: () => Promise<string | undefined>, signal: AbortSignal): Promise<string | undefined> {
    const directory = await mkdtemp(join(tmpdir(), 'angela-voice-'))
    try {
      const path = join(directory, 'input.wav')
      const child = spawn('pw-record', ['--rate', '16000', '--channels', '1', '--format', 's16', path], { stdio: 'ignore' })
      let stopping = false
      const closed = new Promise<void>((resolve, reject) => {
        child.once('error', () => reject(new Error(this.messages.voicePlatform)))
        child.once('close', (code, reason) => code === 0 || reason === 'SIGINT' || (stopping && code === 1) ? resolve() : reject(new Error(this.messages.voiceFailed)))
      })
      const abort = () => {
        stopping = true
        child.kill('SIGINT')
      }
      signal.addEventListener('abort', abort, { once: true })
      try {
        signal.throwIfAborted()
        // A recorder failure must release the terminal question through the caller's signal.
        const text = await Promise.race([stop(), closed.then(() => {
          throw new Error(this.messages.voiceFailed)
        })])
        abort()
        await closed
        signal.throwIfAborted()
        if (text === undefined || text.trim())
          return text
        const body = new FormData()
        body.set('model', this.env.ANGELA_STT_MODEL ?? 'whisper-1')
        body.set('file', new Blob([await readFile(path)], { type: 'audio/wav' }), 'input.wav')
        const response = await this.request('audio/transcriptions', { method: 'POST', body }, signal)
        const data: unknown = await response.json()
        if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string' || !data.text.trim())
          throw new Error(this.messages.voiceEmpty)
        return data.text.trim()
      }
      finally {
        abort()
        await closed.catch(() => {})
        signal.removeEventListener('abort', abort)
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  /** Playback completes before another capture starts, so Angela does not record her own answer. */
  async speak(text: string, signal: AbortSignal) {
    // Bound each audio request and start playback before the remaining text is synthesized.
    const chunks = text.match(/[\s\S]{1,1800}(?:\s|$)|[\s\S]{1,1800}/gu)
    for (const chunk of chunks ?? []) {
      signal.throwIfAborted()
      await this.speakChunk(chunk, signal)
    }
  }

  private async speakChunk(text: string, signal: AbortSignal) {
    const response = await this.request('audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.env.ANGELA_TTS_MODEL ?? 'tts-1', voice: this.env.ANGELA_TTS_VOICE ?? 'alloy', input: text, response_format: 'wav' }),
    }, signal)
    const directory = await mkdtemp(join(tmpdir(), 'angela-voice-'))
    try {
      const path = join(directory, 'answer.wav')
      await writeFile(path, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 })
      signal.throwIfAborted()
      await new Promise<void>((resolve, reject) => {
        const child = spawn('pw-play', [path], { stdio: 'ignore', signal })
        child.once('error', () => reject(new Error(this.messages.voicePlatform)))
        child.once('close', code => code === 0 ? resolve() : reject(new Error(this.messages.voiceFailed)))
      })
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  private async request(path: string, init: RequestInit, signal: AbortSignal) {
    const headers = new Headers(init.headers)
    if (this.env.ANGELA_VOICE_API_KEY)
      headers.set('Authorization', `Bearer ${this.env.ANGELA_VOICE_API_KEY}`)
    const response = await fetch(new URL(path, this.baseUrl), { ...init, headers, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) })
    if (!response.ok)
      throw new Error(`${this.messages.voiceFailed} HTTP ${response.status}`)
    return response
  }
}
