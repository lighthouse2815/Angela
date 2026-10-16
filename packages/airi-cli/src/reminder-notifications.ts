import type { cliMessages } from '@proj-airi/i18n/cli'

import type { ReminderNotifier } from './reminder-scheduler'
import type { Task } from './task-schema'
import type { Voice } from './voice'

import { stripVTControlCharacters } from 'node:util'

import { formatTask } from './task-commands'

/** Buffers text during chat output. Voice runs only when the host reaches a safe boundary after capture or reply playback. */
export class ReminderNotifications implements ReminderNotifier {
  private readonly pending: { tasks: readonly Task[], overdue: boolean }[] = []
  private readonly speech: string[] = []
  private paused = false
  private voiceEnabled = false
  private speaking?: Promise<void>

  constructor(private readonly messages: typeof cliMessages.en.tasks, private readonly locale: string, private readonly present: (text: string, tasks: readonly Task[]) => void) {}

  async notify(tasks: readonly Task[], overdue: boolean, signal: AbortSignal) {
    signal.throwIfAborted()
    this.pending.push({ tasks, overdue })
    if (!this.paused)
      this.resume()
  }

  pause() {
    this.paused = true
  }

  /** Flushes complete notifications after the host releases streamed output and approval prompts. */
  resume() {
    this.paused = false
    for (const batch of this.pending.splice(0)) {
      const heading = batch.overdue ? this.messages.overdue : this.messages.reminder
      const text = `${heading}\n\n${batch.tasks.map(task => formatTask(task, this.locale, this.messages)).join('\n')}`
      this.present(text, batch.tasks)
      if (this.voiceEnabled)
        this.speech.push(`${heading}. ${batch.tasks.map(task => stripVTControlCharacters(task.title)).join('. ')}`)
    }
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
            this.present(this.messages.voiceFailed, [])
        }
      }
    })().finally(() => { this.speaking = undefined })
    await this.speaking
  }
}
