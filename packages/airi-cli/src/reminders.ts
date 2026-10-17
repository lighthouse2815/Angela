import type { cliMessages } from '@proj-airi/i18n/cli'

import type { ReminderNotifier } from './reminder-scheduler'
import type { Task } from './task-schema'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs, promisify } from 'node:util'

import { readConfig } from './config'
import { ReminderScheduler } from './reminder-scheduler'
import { formatTask } from './task-commands'
import { Tasks } from './tasks'

const execute = promisify(execFile)
const service = 'angela-reminders.service'

/** Submits desktop notifications through libnotify. Only successful D-Bus submission acknowledges the scheduler's claim. */
export class DesktopReminders implements ReminderNotifier {
  constructor(private readonly messages: typeof cliMessages.en.tasks, private readonly locale: string, private readonly env: NodeJS.ProcessEnv) {}

  async notify(tasks: readonly Task[], overdue: boolean, signal: AbortSignal, verify?: () => Promise<void>) {
    await verify?.()
    signal.throwIfAborted()
    // Disable markup so saved titles cannot inject notification formatting or links.
    const text = tasks.map(task => formatTask(task, this.locale, this.messages)).join('\n\n').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    await execute('notify-send', ['--app-name=Angela', '--', overdue ? this.messages.overdue : this.messages.reminder, text], { env: this.env, signal, timeout: 10_000 })
  }
}

/** Quotes one systemd ExecStart argument. Unit specifiers and environment expansion must remain literal user data. */
function unitArgument(value: string) {
  if (/\p{Cc}/u.test(value))
    throw new Error('Invalid service argument')
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/%/gu, '%%').replace(/\$/gu, '$$$$')}"`
}

/**
 * Runs the existing scheduler without a chat provider, or manages its Linux user service.
 *
 * Call stack:
 * runReminders -> ReminderScheduler -> Tasks -> DesktopReminders -> notify-send
 *              -> systemctl --user -> angela-reminders.service
 */
export async function runReminders(args: string[], env: NodeJS.ProcessEnv) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'data-dir': { type: 'string' },
    'locale': { type: 'string' },
    'help': { type: 'boolean', short: 'h' },
  } })
  const config = await readConfig(['--list-sessions', ...(values.locale ? ['--locale', values.locale] : []), ...(values['data-dir'] ? ['--data-dir', values['data-dir']] : [])], env)
  const { messages } = config
  if (values.help) {
    process.stdout.write(`${messages.reminders.usage}\n`)
    return
  }
  const action = positionals[0] ?? 'status'
  if (positionals.length > 1 || !['run', 'install', 'start', 'stop', 'status'].includes(action) || config.help || !config.list)
    throw new Error(messages.reminders.usage)
  if (process.platform !== 'linux')
    throw new Error(messages.reminders.linux)
  const locale = values.locale ?? env.ANGELA_LOCALE ?? 'vi'
  if (action === 'run') {
    const shutdown = new AbortController()
    const stop = () => shutdown.abort()
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
    // The scheduler's timers are unref'ed for chat hosts. This foreground host owns its process lifetime explicitly.
    const keepAlive = setInterval(() => {}, 60_000)
    const scheduler = new ReminderScheduler(new Tasks(config.dataDir, messages.tasks), new DesktopReminders(messages.tasks, locale, env), () => {
      process.stderr.write(`${messages.tasks.failed}\n`)
    })
    try {
      await execute('notify-send', ['--version'], { env, timeout: 5000 })
      await scheduler.start()
      process.stdout.write(`${messages.reminders.running}\n`)
      if (!shutdown.signal.aborted)
        await new Promise<void>(done => shutdown.signal.addEventListener('abort', () => done(), { once: true }))
    }
    finally {
      clearInterval(keepAlive)
      await scheduler.close()
      process.off('SIGTERM', stop)
      process.off('SIGINT', stop)
    }
    return
  }
  if (action === 'install') {
    if (!/\.m?js$/u.test(process.argv[1] ?? ''))
      throw new Error(messages.reminders.build)
    await execute('notify-send', ['--version'], { env, timeout: 5000 })
    const directory = join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'systemd', 'user')
    const command = [process.execPath, resolve(process.argv[1]!), 'reminders', 'run', '--data-dir', config.dataDir, '--locale', locale]
    const unit = `[Unit]\nDescription=Angela reminders\nAfter=graphical-session.target\n\n[Service]\nType=exec\nExecStart=${command.map(unitArgument).join(' ')}\nRestart=on-failure\nRestartSec=10\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, service)
    try {
      await writeFile(path, unit, { flag: 'wx', mode: 0o600 })
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST' || await readFile(path, 'utf8') !== unit)
        throw new Error(messages.reminders.exists)
    }
    await execute('systemctl', ['--user', 'daemon-reload'], { env, timeout: 10_000 })
    process.stdout.write(`${messages.reminders.installed}\n`)
    return
  }
  const command = action === 'start' ? ['enable', '--now', service] : action === 'stop' ? ['disable', '--now', service] : ['show', service, '--property=ActiveState,SubState,UnitFileState']
  const result = await execute('systemctl', ['--user', ...command], { env, timeout: 15_000 }).catch(() => {
    throw new Error(messages.reminders.failed)
  })
  process.stdout.write(`${result.stdout.trim() || messages.reminders.changed}\n`)
}
