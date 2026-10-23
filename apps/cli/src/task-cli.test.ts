import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Tasks } from '@angela/companion/tasks'
import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('lists, shows, snoozes, completes and cancels through real processes without model configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-task-cli-'))
  directories.push(directory)
  const tasks = new Tasks(directory, cliMessages.en.tasks)
  const first = await tasks.create({ title: 'Study LINQ', type: 'reminder' })
  const second = await tasks.create({ title: 'Send report', type: 'reminder' })
  const run = async (args: string[]) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./bin/run.ts', import.meta.url)), ...args, '--data-dir', directory, '--locale', 'en', ...(args[0] === 'task' ? ['--cwd', directory] : [])], {
      env: { ...process.env, ANGELA_MODEL: '', ANGELA_PROVIDER: '', ANGELA_CONFIG: join(directory, 'absent.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => stdout += chunk)
    child.stderr.on('data', chunk => stderr += chunk)
    const [code] = await once(child, 'close')
    return { code, stdout, stderr }
  }
  const listed = await run(['tasks'])
  expect(listed.code, listed.stderr).toBe(0)
  expect(listed.stdout).toContain(first.id)
  expect(listed.stdout).toContain(second.title)
  const shown = await run(['task', 'show', first.id])
  expect(shown.code, shown.stderr).toBe(0)
  expect(shown.stdout).toContain(first.title)
  const before = Date.now()
  const snoozed = await run(['task', 'snooze', first.id, '2h'])
  expect(snoozed.code, snoozed.stderr).toBe(0)
  expect(Date.parse((await tasks.find(first.id)).snoozedUntil!)).toBeGreaterThanOrEqual(before + 7_200_000)
  const completed = await run(['task', 'done', first.id])
  expect(completed.code, completed.stderr).toBe(0)
  expect((await tasks.find(first.id)).status).toBe('completed')
  const cancelled = await run(['task', 'cancel', second.id])
  expect(cancelled.code, cancelled.stderr).toBe(0)
  expect((await tasks.find(second.id)).status).toBe('cancelled')
  expect((await run(['tasks'])).stdout.trim()).toBe(cliMessages.en.tasks.empty)
  expect((await run(['tasks', 'all'])).stdout).toContain(first.id)
  const invalid = await run(['task', 'snooze', first.id, '0h'])
  expect(invalid.code).toBe(1)
  expect(invalid.stderr).toContain(cliMessages.en.tasks.commandUsage)
}, 20_000)
