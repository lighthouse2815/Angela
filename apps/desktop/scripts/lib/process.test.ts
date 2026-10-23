import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { kill, platform } from 'node:process'

import { afterEach, expect, it } from 'vitest'

import { stopProcessGroup } from './process'

const children: ChildProcessWithoutNullStreams[] = []

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.pid !== undefined) {
      try {
        kill(-child.pid, 'SIGKILL')
      }
      catch {
        // The tested cleanup can already have stopped the process group.
      }
    }
  }
})

it.skipIf(platform === 'win32')('stops descendants after the wrapper exits', async () => {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { spawn } from 'node:child_process'
    const worker = spawn(process.execPath, ['--eval', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    console.log(worker.pid)
    worker.unref()
  `], { detached: true, stdio: 'pipe' })
  children.push(child)
  const [output] = await once(child.stdout, 'data')
  const descendantPid = Number(String(output).trim())
  await once(child, 'exit')

  expect(child.exitCode).toBe(0)
  expect(() => kill(descendantPid, 0)).not.toThrow()

  await stopProcessGroup(child)

  await expect.poll(() => {
    try {
      kill(descendantPid, 0)
      return true
    }
    catch {
      return false
    }
  }).toBe(false)
}, 15_000)

it.skipIf(platform === 'win32')('forces exit when a process ignores SIGTERM', async () => {
  const child = spawn(process.execPath, ['--eval', `
    process.on('SIGTERM', () => {})
    setInterval(() => {}, 1000)
    console.log('ready')
  `], { detached: true, stdio: 'pipe' })
  children.push(child)
  await once(child.stdout, 'data')
  const exited = once(child, 'exit')

  await stopProcessGroup(child)

  const [code, signal] = await exited
  expect(code).toBeNull()
  expect(signal).toBe('SIGKILL')
}, 15_000)
