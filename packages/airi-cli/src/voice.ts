import type { Buffer } from 'node:buffer'

import type { cliMessages } from '@angela/i18n/cli'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

import WebSocket from 'ws'

import { EchoCancellation } from './echo-cancellation'

/** Owns private audio files, PipeWire children, and one serial audio request at a time. */
export class Voice {
  private readonly baseUrl: URL
  private echo: EchoCancellation | undefined

  /** Deletes only recognized audio directories older than one day whose owner process is no longer alive. */
  static async cleanupTemporaryAudio(root = tmpdir(), now = Date.now()) {
    let removed = 0
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^angela-voice-[\w-]+$/.test(entry.name))
        continue
      const directory = join(root, entry.name)
      try {
        const info = await lstat(directory)
        if (!info.isDirectory() || now - info.mtimeMs < 86_400_000)
          continue
        const files = await readdir(directory, { withFileTypes: true })
        if (files.some(file => !file.isFile() || !['input.wav', 'answer.wav', 'owner.json'].includes(file.name)))
          continue
        if (files.some(file => file.name === 'owner.json')) {
          const owner: unknown = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'))
          if (!owner || typeof owner !== 'object' || !('pid' in owner) || typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0)
            continue
          try {
            process.kill(owner.pid, 0)
            continue
          }
          catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH')
              continue
          }
        }
        await rm(directory, { recursive: true })
        removed++
      }
      catch {
        // A concurrent cleanup or an inaccessible directory must not prevent chat startup.
      }
    }
    return { removed }
  }

  /** Reads device-local audio configuration. Process environment values override the file. */
  static async load(env: NodeJS.ProcessEnv, messages: typeof cliMessages.en) {
    const path = Voice.environmentPath(env)
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

  /** Creates local audio defaults only when the private configuration file does not exist. */
  static async configureLocal(env: NodeJS.ProcessEnv) {
    const path = Voice.environmentPath(env)
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    try {
      await writeFile(path, 'ANGELA_VOICE_BASE_URL=http://127.0.0.1:8000/v1/\nANGELA_STT_MODEL=small\nANGELA_TTS_MODEL=edge-tts\nANGELA_TTS_VOICE=vi-VN-HoaiMyNeural\n', { flag: 'wx', mode: 0o600 })
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST')
        throw error
    }
  }

  private static environmentPath(env: NodeJS.ProcessEnv) {
    return env.ANGELA_VOICE_ENV ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'voice.env')
  }

  /** Checks readiness without starting a model or opening the microphone. */
  async healthy() {
    try {
      const response = await fetch(new URL('/health', this.baseUrl), { signal: AbortSignal.timeout(3000) })
      const body: unknown = await response.json()
      return response.ok && !!body && typeof body === 'object' && 'status' in body && body.status === 'ok'
    }
    catch {
      return false
    }
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

  /** Enables interruption through an owned echo filter unless the user selects devices or explicit headphone mode. */
  async start(signal: AbortSignal) {
    if (this.echo && !this.echo.active)
      await this.close()
    if (this.echo || this.env.ANGELA_VOICE_SOURCE || this.env.ANGELA_VOICE_SINK || ['0', '1'].includes(this.env.ANGELA_VOICE_BARGE_IN ?? ''))
      return
    const echo = new EchoCancellation(this.env)
    try {
      await echo.start(signal)
      this.echo = echo
    }
    catch (error) {
      // Retain ownership when cleanup fails so the CLI can retry before creating another filter.
      this.echo = echo
      throw error
    }
  }

  /** The CLI stops captures and playback before releasing these devices. */
  async close() {
    await this.echo?.close()
    this.echo = undefined
  }

  /** Echo-filtered devices or an explicit headphone setup permit simultaneous capture and playback. */
  get canInterrupt() {
    return !!this.echo?.active || this.env.ANGELA_VOICE_BARGE_IN === '1'
      || (this.env.ANGELA_VOICE_BARGE_IN !== '0' && !!this.env.ANGELA_VOICE_SOURCE && !!this.env.ANGELA_VOICE_SINK)
  }

  /** One call owns its socket, microphone, and terminal question. Only a completed utterance reaches STT. */
  async listen(command: ((signal: AbortSignal) => Promise<string | undefined>) | undefined, signal: AbortSignal, state: (value: 'ready' | 'speech' | 'transcribing') => void) {
    signal.throwIfAborted()
    const lifetime = new AbortController()
    const combined = AbortSignal.any([signal, lifetime.signal])
    const url = new URL('audio/listen', this.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url, {
      handshakeTimeout: 10_000,
      headers: this.env.ANGELA_VOICE_API_KEY ? { Authorization: `Bearer ${this.env.ANGELA_VOICE_API_KEY}` } : undefined,
    })
    let recorder: ReturnType<typeof spawn> | undefined
    let stopped: Promise<void> | undefined
    let transcribing = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const transcript = new Promise<{ kind: 'transcript', text: string }>((resolve, reject) => {
      const fail = () => reject(new Error(this.messages.voiceFailed))
      const abort = () => reject(combined.reason)
      combined.addEventListener('abort', abort, { once: true })
      socket.once('close', () => {
        combined.removeEventListener('abort', abort)
        fail()
      })
      socket.once('error', fail)
      socket.once('open', () => {
        socket.send(JSON.stringify({ model: this.env.ANGELA_STT_MODEL ?? 'whisper-1' }))
        timer = setTimeout(fail, 10_000)
      })
      socket.on('message', (data, binary) => {
        try {
          if (binary || data.toString().length > 4096)
            throw new Error(this.messages.voiceFailed)
          const message: unknown = JSON.parse(data.toString())
          if (!message || typeof message !== 'object' || !('type' in message))
            throw new Error(this.messages.voiceFailed)
          if (message.type === 'ready' && !recorder) {
            clearTimeout(timer)
            state('ready')
            const source = this.echo?.active ? this.echo.source : this.env.ANGELA_VOICE_SOURCE
            recorder = spawn('pw-record', [...(source ? ['--target', source] : []), '--raw', '--rate', '16000', '--channels', '1', '--format', 's16', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
            recorder.once('error', () => reject(new Error(this.messages.voicePlatform)))
            stopped = new Promise<void>((done) => {
              recorder!.once('close', () => {
                done()
                if (!transcribing && !combined.aborted)
                  fail()
              })
            })
            recorder.stdout?.on('data', (chunk: Buffer) => {
              if (transcribing || combined.aborted)
                return
              if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256_000) {
                fail()
                return
              }
              socket.send(chunk)
            })
          }
          else if (message.type === 'speech' && recorder && !transcribing) {
            state('speech')
          }
          else if (message.type === 'transcribing' && recorder && !transcribing) {
            transcribing = true
            recorder.kill('SIGINT')
            state('transcribing')
            timer = setTimeout(fail, 120_000)
          }
          else if (message.type === 'transcript' && transcribing && 'text' in message && typeof message.text === 'string') {
            resolve({ kind: 'transcript', text: message.text.trim() })
          }
          else {
            fail()
          }
        }
        catch {
          fail()
        }
      })
    })
    const commands = async () => {
      while (true) {
        const text = await command!(combined)
        if (text === undefined || text.trim())
          return { kind: 'command' as const, text: text?.trim() }
      }
    }
    try {
      return await (command ? Promise.race([transcript, commands()]) : transcript)
    }
    finally {
      lifetime.abort()
      clearTimeout(timer)
      recorder?.kill('SIGINT')
      socket.terminate()
      await stopped
    }
  }

  /** The caller selects echo-filtered devices before enabling concurrent capture and playback. */
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
      await writeFile(join(directory, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: 'wx' })
      const path = join(directory, 'answer.wav')
      await writeFile(path, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 })
      signal.throwIfAborted()
      await new Promise<void>((resolve, reject) => {
        const sink = this.echo?.active ? this.echo.sink : this.env.ANGELA_VOICE_SINK
        const child = spawn('pw-play', [...(sink ? ['--target', sink] : []), path], { stdio: 'ignore', signal })
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
