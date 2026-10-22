import type { Task } from './task-schema'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { errorMessageFrom } from '@moeru/std'

import { readConfig } from './config'
import { Memory } from './memory'
import { ProjectMemory } from './project-memory'
import { Recall } from './recall'
import { Skills } from './skills'
import { formatTask, taskCommand, taskEvidence } from './task-commands'
import { taskDuration } from './task-time'
import { Tasks } from './tasks'

/**
 * Manages persistent commitments without loading a model or opening a chat.
 *
 * Call stack:
 * runTaskCli -> taskCommand -> Tasks -> MemoryFile
 *            -> Recall.capture -> MemoryCapture -> verified commitment episode
 */
export async function runTaskCli(args: string[], env: NodeJS.ProcessEnv, listOnly = false) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'data-dir': { type: 'string' },
    'locale': { type: 'string' },
    'cwd': { type: 'string' },
    'help': { type: 'boolean', short: 'h' },
  } })
  const config = await readConfig(['--list-sessions', ...(values.locale ? ['--locale', values.locale] : []), ...(values['data-dir'] ? ['--data-dir', values['data-dir']] : [])], env)
  const messages = config.messages
  if (config.help || !config.list)
    throw new Error(messages.tasks.commandUsage)
  if (values.help) {
    process.stdout.write(`${messages.tasks.commandUsage}\n`)
    return
  }
  const locale = values.locale ?? env.ANGELA_LOCALE ?? 'vi'
  const tasks = new Tasks(config.dataDir, messages.tasks, undefined, env.ANGELA_TIMEZONE)
  const [action, id, duration, ...extra] = positionals
  if (listOnly) {
    if (positionals.length > 1 || (action && action !== 'all'))
      throw new Error(messages.tasks.commandUsage)
    process.stdout.write(`${await taskCommand(`/tasks${action ? ' all' : ''}`, tasks, messages.tasks, locale)}\n`)
    return
  }
  if (!id || extra.length || (action === 'snooze' ? !duration : Boolean(duration)) || !['show', 'done', 'cancel', 'snooze'].includes(action!))
    throw new Error(messages.tasks.commandUsage)
  if (action === 'show') {
    process.stdout.write(`${formatTask(await tasks.find(id), locale, messages.tasks)}\n`)
    return
  }
  if (action === 'snooze' && !taskDuration(duration!))
    throw new Error(messages.tasks.commandUsage)
  await tasks.find(id)
  const record = async (task: Task) => {
    let recall: Recall | undefined
    try {
      const workspace = (await ProjectMemory.open(config.dataDir, await realpath(values.cwd ?? process.cwd()), messages)).workspace
      const sessionId = randomUUID()
      recall = new Recall(config.dataDir, workspace, sessionId, messages, env, { apiKey: '' }, new Memory(config.dataDir, messages), new Skills(config.dataDir, messages))
      await recall.start()
      const capture = await recall.capture()
      capture?.record({ id: randomUUID(), correlationId: randomUUID(), timestamp: new Date(tasks.now()).toISOString(), workspace, sessionId, channel: 'cli', type: action === 'done' ? 'task.completed' : 'task.updated', taskId: task.id }, taskEvidence(task), true)
      capture?.finish('')
    }
    catch (error) {
      process.stderr.write(`${messages.memoryUnavailable} ${errorMessageFrom(error) ?? ''}\n`)
    }
    finally {
      await recall?.close()
    }
  }
  const response = await taskCommand(`/${action} ${id}${duration ? ` ${duration}` : ''}`, tasks, messages.tasks, locale, record)
  process.stdout.write(`${response}\n`)
}
