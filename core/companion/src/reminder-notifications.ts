import type { cliMessages } from '@angela/i18n/cli'
import type { Voice } from '@angela/voice-client/voice'

import type { OpenLoop } from './open-loops'
import type { ReminderNotifier } from './reminder-scheduler'
import type { Task } from './task-schema'

import { formatTask, taskPrompt } from './task-commands'

/** Buffers text during chat output. Voice runs only when the host reaches a safe boundary after capture or reply playback. */
export class ReminderNotifications implements ReminderNotifier {
  private readonly waiting = new Set<() => void>()
  private readonly speech: string[] = []
  private paused = false
  private voiceEnabled = false
  private speaking?: Promise<void>

  constructor(private readonly messages: typeof cliMessages.en.tasks, private readonly locale: string, private readonly present: (text: string, tasks: readonly Task[], signal?: AbortSignal, loop?: OpenLoop) => void | Promise<void>) {}

  /** Resolves only after text presentation. Buffered calls reject on cancellation without presenting stale notifications. */
  async notify(tasks: readonly Task[], overdue: boolean, signal: AbortSignal, verify?: () => Promise<void>) {
    await this.wait(signal, verify)
    const heading = overdue ? this.messages.overdue : this.messages.reminder
    const text = `${heading}\n\n${tasks.map(task => `${taskPrompt(task, this.messages)}\n${formatTask(task, this.locale, this.messages)}`).join('\n')}`
    await this.present(text, tasks, signal)
    if (this.voiceEnabled) {
      if (this.speech.length >= 8)
        this.speech.shift()
      this.speech.push(`${heading}. ${tasks.map(task => taskPrompt(task, this.messages)).join(' ')}`.slice(0, 4000))
    }
  }

  async notifyOpenLoop(loop: OpenLoop, signal: AbortSignal, verify: () => Promise<void>) {
    await this.wait(signal)
    await verify()
    signal.throwIfAborted()
    const subject = loop.subject.trim().replace(/^(?:(?:phần|vụ|việc|chuyện|buổi|part|event)\s+)+/iu, '')
    const text = this.messages.implicitFollowUp[loop.kind].replace('{subject}', subject)
    await this.present(text.charAt(0).toLocaleUpperCase(this.locale) + text.slice(1), [], signal, loop)
  }

  private async wait(signal: AbortSignal, verify?: () => Promise<void>) {
    do {
      signal.throwIfAborted()
      if (this.paused) {
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            this.waiting.delete(finish)
            signal.removeEventListener('abort', finish)
            if (signal.aborted)
              reject(signal.reason)
            else
              resolve()
          }
          this.waiting.add(finish)
          signal.addEventListener('abort', finish, { once: true })
        })
      }
      await verify?.()
      signal.throwIfAborted()
    } while (this.paused)
  }

  pause() {
    this.paused = true
  }

  /** Releases buffered delivery after streamed output and approvals. The scheduler retains the lease until presentation completes. */
  resume() {
    this.paused = false
    for (const finish of this.waiting)
      finish()
  }

  setVoiceEnabled(enabled: boolean) {
    this.voiceEnabled = enabled
    if (!enabled)
      this.speech.length = 0
  }

  get hasSpeech() {
    return this.speech.length > 0
  }

  /** Reuses the existing TTS/playback boundary. Cancellation and audio errors never retract the text notification. */
  async speak(voice: Pick<Voice, 'speak'>, signal: AbortSignal) {
    this.speaking ??= (async () => {
      while (!this.paused && this.voiceEnabled && this.speech.length && !signal.aborted) {
        const text = this.speech.shift()!
        try {
          await voice.speak(text, signal)
        }
        catch {
          if (!signal.aborted)
            await this.present(this.messages.voiceFailed, [])
        }
      }
    })().finally(() => { this.speaking = undefined })
    await this.speaking
  }
}
