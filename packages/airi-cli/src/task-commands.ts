import type { cliMessages } from '@proj-airi/i18n/cli'

import type { Task } from './task-schema'
import type { Tasks } from './tasks'

import { stripVTControlCharacters } from 'node:util'

import { localDate, taskDue, taskDuration } from './task-time'

/** Renders saved data without terminal escape sequences. IDs remain stable across views and restarts. */
export function formatTask(task: Task, locale: string, noTime: string) {
  const due = taskDue(task)
  const time = due ? new Intl.DateTimeFormat(locale, { timeZone: task.timezone, dateStyle: 'short', timeStyle: 'short' }).format(Date.parse(due)) : task.dueDate ?? noTime
  return `${time} [${task.type}/${task.status}] ${stripVTControlCharacters(task.title).replace(/[\r\n]/gu, ' ')}\n  ${task.id} (${task.timezone})`
}

/** Direct commands share the same service as model tools. Normal messages pass through unchanged. */
export async function taskCommand(text: string, tasks: Tasks, messages: typeof cliMessages.en.tasks, locale: string): Promise<string | undefined> {
  const [command, selection, duration, ...extra] = text.trim().split(/\s+/u)
  if (!['/tasks', '/today', '/done', '/cancel', '/snooze'].includes(command!))
    return undefined
  if (command === '/tasks' || command === '/today') {
    if (duration || (selection && (command !== '/tasks' || selection !== 'all')))
      return messages.usage
    const list = await tasks.list({ status: selection === 'all' ? 'all' : 'pending', date: command === '/today' ? localDate(tasks.now(), tasks.timezone) : undefined })
    return list.length ? `${command === '/today' ? messages.today : messages.heading}\n\n${list.map(task => formatTask(task, locale, messages.noTime)).join('\n')}` : messages.empty
  }
  if (!selection || extra.length || (command === '/snooze' ? !duration : Boolean(duration)))
    return messages.usage
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(selection))
    return messages.missing
  let saved: Task
  if (command === '/done') {
    saved = await tasks.complete(selection)
  }
  else if (command === '/cancel') {
    saved = await tasks.cancel(selection)
  }
  else {
    const delay = taskDuration(duration!)
    if (!delay)
      return messages.usage
    saved = await tasks.snooze(selection, new Date(tasks.now() + delay).toISOString())
  }
  return `${messages.saved}\n${formatTask(saved, locale, messages.noTime)}`
}
