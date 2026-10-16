import type { Buffer } from 'node:buffer'

import type { cliMessages } from '@proj-airi/i18n/cli'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { lstat, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

import WebSocket from 'ws'

/** Owns private audio files, PipeWire children, and one serial audio request at a time. */
export class Voice {
  private readonly baseUrl: URL

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

  /** One call owns its socket, microphone, and terminal question. Only a completed utterance reaches STT. */
  async listen(command: (signal: AbortSignal) => Promise<string | undefined>, signal: AbortSignal, state: (value: 'ready' | 'speech' | 'transcribing') => void) {
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
            recorder = spawn('pw-record', ['--raw', '--rate', '16000', '--channels', '1', '--format', 's16', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
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
        const text = await command(combined)
        if (text === undefined || text.trim())
          return { kind: 'command' as const, text: text?.trim() }
      }
    }
    try {
      return await Promise.race([transcript, commands()])
    }
    finally {
      lifetime.abort()
      clearTimeout(timer)
      recorder?.kill('SIGINT')
      socket.terminate()
      await stopped
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
      await writeFile(join(directory, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: 'wx' })
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
