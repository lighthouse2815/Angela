import process from 'node:process'

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { ReminderScheduler } from './reminder-scheduler'
import { DesktopReminders } from './reminders'
import { Tasks } from './tasks'

const directories: string[] = []
const schedulers: ReminderScheduler[] = []
afterEach(async () => {
  await Promise.all(schedulers.splice(0).map(scheduler => scheduler.close()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup(fail = false) {
  const directory = await mkdtemp(join(tmpdir(), 'angela-desktop-reminders-'))
  directories.push(directory)
  const log = join(directory, 'notifications.json')
  // The executable is the real external boundary. No desktop notification reaches the test machine.
  await writeFile(join(directory, 'notify-send'), `#!${process.execPath}
import { writeFileSync } from 'node:fs'
if (process.env.TEST_NOTIFY_FAIL === '1') process.exit(1)
writeFileSync(process.env.TEST_NOTIFY_LOG, JSON.stringify(process.argv.slice(2)))
`, { mode: 0o700 })
  const env = { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`, TEST_NOTIFY_LOG: log, TEST_NOTIFY_FAIL: fail ? '1' : '0' }
  const tasks = new Tasks(directory, cliMessages.en.tasks)
  const error = vi.fn()
  const notifier = new DesktopReminders(cliMessages.en.tasks, 'en', env)
  const scheduler = new ReminderScheduler(tasks, notifier, error)
  schedulers.push(scheduler)
  return { tasks, log, notifier, scheduler, error }
}

it('acknowledges successful desktop delivery and escapes task markup without shell evaluation', async () => {
  const { tasks, scheduler, log, error } = await setup()
  const task = await tasks.create({ title: '<b>Study</b> & $(echo private)', type: 'reminder', dueAt: new Date().toISOString() })
  await scheduler.start()
  expect(error).not.toHaveBeenCalled()
  expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
  const args = JSON.parse(await readFile(log, 'utf8')) as string[]
  expect(args).toContain('--')
  expect(args.at(-1)).toContain('&lt;b&gt;Study&lt;/b&gt; &amp; $(echo private)')
  await scheduler.refresh()
  expect((await tasks.find(task.id)).lastNotifiedAt).toBeDefined()
})

it('keeps failed desktop submission retryable instead of acknowledging the occurrence', async () => {
  const { tasks, scheduler, error } = await setup(true)
  const task = await tasks.create({ title: 'Retry later', type: 'reminder', dueAt: new Date().toISOString() })
  await scheduler.start()
  expect(error).toHaveBeenCalledOnce()
  expect((await tasks.find(task.id)).lastNotifiedAt).toBeUndefined()
  expect((await tasks.find(task.id)).delivery?.status).not.toBe('delivered')
})

it('checks ownership and cancellation before starting the notification executable', async () => {
  const { tasks, notifier, log } = await setup()
  const task = await tasks.create({ title: 'Cancelled', type: 'reminder' })
  const verify = vi.fn().mockRejectedValue(new Error('Changed claim'))
  await expect(notifier.notify([task], false, new AbortController().signal, verify)).rejects.toThrow('Changed claim')
  await expect(readFile(log)).rejects.toMatchObject({ code: 'ENOENT' })
  const controller = new AbortController()
  controller.abort()
  await expect(notifier.notify([task], false, controller.signal)).rejects.toThrow()
  await expect(readFile(log)).rejects.toMatchObject({ code: 'ENOENT' })
})
