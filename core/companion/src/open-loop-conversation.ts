import type { cliMessages } from '@angela/i18n/cli'

import type { ActiveCommitments } from './active-commitments'
import type { Memory } from './memory'
import type { OpenLoops } from './open-loops'
import type { RequestPrivacy } from './privacy-policy'
import type { Tasks } from './tasks'

import { extractOpenLoop, openLoopKey, openLoopOutcome } from './open-loop-extraction'
import { taskSuppressesOpenLoop } from './open-loops'
import { durableWriteRejection } from './privacy-policy'

/** Host-owned extraction and focus resolution run before model tools. Notice creates state without replacing the ordinary chat reply. */
export class OpenLoopConversation {
  constructor(private readonly loops: OpenLoops, private readonly active: ActiveCommitments, private readonly tasks: Tasks, private readonly workspace: string, private readonly sessionId: string, private readonly messages: typeof cliMessages.en.tasks, private readonly memory?: Memory) {}

  async handle(text: string, privacy: RequestPrivacy): Promise<string | undefined> {
    const outcome = openLoopOutcome(text)
    if (outcome?.state !== 'dismissed' && durableWriteRejection(privacy, 'personal', text))
      return undefined
    if (outcome?.state !== 'dismissed')
      await this.loops.noteActivity()
    if (outcome) {
      const focus = await this.active.current(this.tasks.now())
      const all = (await this.loops.list()).filter(loop => loop.state === 'open')
      const selected = outcome.key ? all.filter(loop => loop.workspace === this.workspace && loop.key === outcome.key) : focus.length === 1 && focus[0]!.kind === 'open_loop' ? all.filter(loop => loop.id === focus[0]!.id) : []
      if (selected.length === 1 && await this.loops.finish(selected[0]!.id, selected[0]!.workspace, outcome.state, privacy)) {
        if (outcome.forgetMemory && this.memory) {
          try {
            const personal = await this.memory.read()
            const matching = personal.entries.filter(entry => openLoopKey(entry.text) === selected[0]!.key)
            if (matching.length > 1 || (matching.length && !personal.enabled))
              return `${this.messages.openLoopDismissed}\n${this.messages.openLoopMemoryUnchanged}`
            if (matching.length === 1)
              await this.memory.forget(matching[0]!.id, matching[0]!.text, this.sessionId)
          }
          catch {
            return `${this.messages.openLoopDismissed}\n${this.messages.openLoopMemoryUnchanged}`
          }
        }
        return outcome.state === 'resolved' ? this.messages.openLoopResolved : this.messages.openLoopDismissed
      }
      // With no active named thread, retain the existing model-assisted personal-memory forget flow.
      if (outcome.forgetMemory && outcome.key && !selected.length)
        return undefined
      if (outcome.state === 'dismissed' || focus.some(reference => reference.kind === 'open_loop') || selected.length > 1)
        return this.messages.clarifyOpenLoop
      return undefined
    }
    const extraction = extractOpenLoop(text, this.tasks.now(), this.tasks.timezone)
    if (!extraction)
      return undefined
    const tasks = await this.tasks.list({ status: 'all' })
    if (tasks.some(task => taskSuppressesOpenLoop(task, this.workspace, extraction.key))) {
      await this.loops.reconcile(tasks)
      return undefined
    }
    const loop = await this.loops.notice(extraction, this.workspace, this.sessionId, privacy)
    await this.loops.reconcile(await this.tasks.list({ status: 'all' }))
    if (loop)
      await this.active.mentionReferences([{ kind: 'open_loop', id: loop.id }], 'conversation', this.tasks.now())
    return undefined
  }
}
