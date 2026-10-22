import type { Conversation } from '@angela/core-agent'
import type { cliMessages } from '@angela/i18n/cli'

import type { RequestPrivacy } from './privacy-policy'
import type { Task } from './task-schema'
import type { Tasks } from './tasks'

import { extractCommitment } from './commitment-extraction'
import { durableWriteRejection } from './privacy-policy'
import { parseReminderTime } from './reminder-time'
import { formatTask } from './task-commands'

/** Local transitions return verified state. Unsupported wording continues through the existing structured model tools. */
export interface CommitmentReply {
  text: string
  task?: Task
  action?: 'created' | 'completed' | 'updated'
}

/** Uses conversation-local task references, including delivered notifications. It never retains a global last-task ID. */
export class CommitmentConversation {
  constructor(private readonly tasks: Tasks, private readonly messages: typeof cliMessages.en.tasks, private readonly locale: string, private readonly memoryProjection?: Task['memoryProjection']) {}

  async handle(text: string, history: Conversation, privacy: RequestPrivacy): Promise<CommitmentReply | undefined> {
    if (durableWriteRejection(privacy, 'task', text) && /nhắc|gọi\s+(?:tôi|tao|mình)/iu.test(text))
      return { text: this.messages.protected }
    let extraction = extractCommitment(text, this.tasks.now(), this.tasks.timezone)
    // Only a short time answer can extend the immediately preceding reminder request.
    if (!extraction.isCommitment && /^(?:lúc\s+)?\d{1,2}(?:h\d{0,2}|:\d{2}|\s*giờ)(?:\s*(?:sáng|chiều|tối))?[.!\s]*$/iu.test(text)) {
      const previous = history.turns.findLast(turn => turn.type === 'user')
      const source = previous?.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
      if (source) {
        const pending = extractCommitment(source, this.tasks.now(), this.tasks.timezone)
        if (pending.isCommitment && pending.time.status === 'clarify' && pending.time.date)
          extraction = extractCommitment(`${pending.time.date.split('-').reverse().join('/')} ${text} nhắc tôi ${pending.title}`, this.tasks.now(), this.tasks.timezone)
      }
    }
    if (extraction.isCommitment && extraction.confidence >= 0.95) {
      const rejection = durableWriteRejection(privacy, 'task', text)
      if (rejection)
        return { text: this.messages.protected }
      if (extraction.time.status !== 'resolved')
        return { text: extraction.time.status === 'invalid' ? this.messages.invalidTime : this.messages.clarifyTime }
      const task = await this.tasks.create({ title: extraction.title, type: 'reminder', dueAt: extraction.time.remindAt, timezone: this.tasks.timezone }, this.memoryProjection)
      return this.saved(task, 'created')
    }
    const controlText = text.trim().replace(/[.!]+$/u, '').trim()
    const control = /^(?:(?:tao|tôi|mình)\s+)?(?:đã\s+)?(?:làm\s+)?xong(?:\s+rồi)?$|^hoàn thành(?:\s+(?:rồi|việc .+))?$/iu.test(controlText)
      ? 'completed'
      : /^(?:không cần nhắc (?:cái đó(?: nữa)?|nữa)|(?:hủy|huỷ|bỏ nhắc)(?:\s+\S.*)?)$/iu.test(controlText)
        ? 'cancelled'
        : /nhắc lại$/iu.test(controlText) ? 'snoozed' : undefined
    if (!control)
      return undefined
    const rejection = durableWriteRejection(privacy, 'task', text)
    if (rejection)
      return { text: this.messages.protected }
    const all = await this.tasks.list({ status: 'all' })
    const named = all.filter(task => text.toLocaleLowerCase().includes(task.title.toLocaleLowerCase()))
    let candidates = named
    if (!candidates.length) {
      const latest = history.turns.findLast(turn => turn.type === 'assistant')
      const content = latest ? JSON.stringify(latest) : ''
      candidates = all.filter(task => content.includes(task.id))
    }
    if (candidates.length !== 1)
      return { text: this.messages.clarifyTask }
    const selected = candidates[0]!
    if (selected.status !== 'pending')
      return { text: this.messages.inactive }
    if (control === 'completed')
      return this.saved(await this.tasks.complete(selected.id), 'completed')
    if (control === 'cancelled')
      return this.saved(await this.tasks.cancel(selected.id), 'updated')
    const time = parseReminderTime(text, this.tasks.now(), this.tasks.timezone)
    if (time.status !== 'resolved')
      return { text: time.status === 'invalid' ? this.messages.invalidTime : this.messages.clarifyTime }
    return this.saved(await this.tasks.snooze(selected.id, time.remindAt), 'updated')
  }

  private saved(task: Task, action: CommitmentReply['action']): CommitmentReply {
    const heading = action === 'created' ? this.messages.created : action === 'completed' ? this.messages.completed : task.status === 'cancelled' ? this.messages.cancelled : this.messages.snoozed
    return { text: `${heading}\n${formatTask(task, this.locale, this.messages)}`, task, action }
  }
}
