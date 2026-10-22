import type { cliMessages } from '@angela/i18n/cli'

import type { ActiveCommitments } from './active-commitments'
import type { OpenLoops } from './open-loops'
import type { RequestPrivacy } from './privacy-policy'
import type { Tasks } from './tasks'

import { extractOpenLoop, openLoopOutcome } from './open-loop-extraction'
import { taskSuppressesOpenLoop } from './open-loops'
import { durableWriteRejection } from './privacy-policy'

/** Host-owned extraction and focus resolution run before model tools. Notice creates state without replacing the ordinary chat reply. */
export class OpenLoopConversation {
  constructor(private readonly loops: OpenLoops, private readonly active: ActiveCommitments, private readonly tasks: Tasks, private readonly workspace: string, private readonly sessionId: string, private readonly messages: typeof cliMessages.en.tasks) {}

  async handle(text: string, privacy: RequestPrivacy): Promise<string | undefined> {
    if (durableWriteRejection(privacy, 'personal', text))
      return undefined
    await this.loops.noteActivity()
    const outcome = openLoopOutcome(text)
    if (outcome) {
      const focus = await this.active.current(this.tasks.now())
      const all = (await this.loops.list()).filter(loop => loop.state === 'open')
      const selected = outcome.key ? all.filter(loop => loop.workspace === this.workspace && loop.key === outcome.key) : focus.length === 1 && focus[0]!.kind === 'open_loop' ? all.filter(loop => loop.id === focus[0]!.id) : []
      if (selected.length === 1 && await this.loops.finish(selected[0]!.id, selected[0]!.workspace, outcome.state, privacy))
        return outcome.state === 'resolved' ? this.messages.openLoopResolved : this.messages.openLoopDismissed
      if (focus.some(reference => reference.kind === 'open_loop') || selected.length > 1)
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
