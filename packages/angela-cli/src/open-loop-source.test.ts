import type { OpenLoop } from './open-loops'
import type { ReminderNotifier } from './reminder-scheduler'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { extractOpenLoop } from './open-loop-extraction'
import { OpenLoopSource } from './open-loop-source'
import { OpenLoops } from './open-loops'
import { requestPrivacy } from './privacy-policy'
import { ProactivePolicy } from './proactive-policy'
import { ReminderNotifications } from './reminder-notifications'
import { Tasks } from './tasks'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-loop-source-'))
  directories.push(directory)
  let now = Date.parse('2026-10-23T10:00:00Z')
  const clock = { now: () => now }
  const loops = new OpenLoops(directory, cliMessages.en.tasks, clock)
  const tasks = new Tasks(directory, cliMessages.en.tasks, clock, 'UTC')
  const loop = (await loops.notice(extractOpenLoop('Auth vẫn lỗi.', now, 'UTC')!, directory, 'session', requestPrivacy('')))!
  const advance = (hours: number) => {
    now += hours * 3_600_000
  }
  advance(4)
  return { directory, clock, loops, loop, tasks, advance }
}
it('retries a failure before presentation and stops after an uncertain external delivery', async () => {
  const { directory, clock, loops, loop, tasks, advance } = await setup()
  let attempts = 0
  const notifier: ReminderNotifier = {
    notify: async () => {},
    notifyOpenLoop: async (_loop, _signal, verify) => {
      attempts++
      if (attempts === 1)
        throw new Error('Transport unavailable before presentation')
      await verify()
      throw new Error('Crash after external presentation')
    },
  }
  const source = new OpenLoopSource(loops, clock, 'UTC', new ProactivePolicy(), notifier, async () => true, () => {}, tasks)
  const refresh = async () => await source.refresh(new AbortController().signal, {}, await tasks.list())
  await expect(refresh()).rejects.toThrow('before presentation')
  expect((await loops.list())[0]?.promptCount).toBe(0)
  await refresh()
  expect(attempts).toBe(1)
  advance(1 / 60)
  await expect(refresh()).rejects.toThrow('after external presentation')
  expect((await loops.list())[0]?.promptCount).toBe(1)
  const recovered = new OpenLoopSource(new OpenLoops(directory, cliMessages.en.tasks, clock), clock, 'UTC', new ProactivePolicy(), notifier, async () => true)
  advance(10)
  await recovered.refresh(new AbortController().signal, {}, [])
  expect(attempts).toBe(2)
  expect((await loops.list())[0]?.id).toBe(loop.id)
})
it.each(['privacy', 'task'])('revalidates %s immediately before presentation', async (change) => {
  const { directory, clock, loops, tasks } = await setup()
  let allowed = true
  const present = vi.fn()
  const notifier: ReminderNotifier = {
    notify: async () => {},
    notifyOpenLoop: async (current, signal, verify) => {
      if (change === 'privacy')
        allowed = false
      else
        await tasks.create({ title: 'fix auth', type: 'todo' }, { scope: directory, sourceSessionId: 'session' })
      await verify()
      signal.throwIfAborted()
      present(current)
    },
  }
  const source = new OpenLoopSource(loops, clock, 'UTC', new ProactivePolicy(), notifier, async () => allowed, () => {}, tasks)
  await expect(source.refresh(new AbortController().signal, {}, [])).rejects.toThrow(change === 'privacy' ? 'privacy changed' : 'expired or changed')
  expect(present).not.toHaveBeenCalled()
  expect((await loops.list())[0]?.promptCount).toBe(0)
  expect((await loops.list())[0]?.state).toBe(change === 'task' ? 'dismissed' : 'open')
})
it('does not consume a queued claim if activity changes while output is paused', async () => {
  const { clock, loops, tasks } = await setup()
  const presented: OpenLoop[] = []
  const notifications = new ReminderNotifications(cliMessages.en.tasks, 'en', (_text, _tasks, _signal, loop) => {
    if (loop)
      presented.push(loop)
  })
  notifications.pause()
  const source = new OpenLoopSource(loops, clock, 'UTC', new ProactivePolicy(), notifications, async () => true, () => {}, tasks)
  const refresh = source.refresh(new AbortController().signal, {}, [])
  await vi.waitFor(async () => {
    expect((await loops.list())[0]?.claim).toBeDefined()
  })
  await loops.noteActivity()
  notifications.resume()
  await expect(refresh).rejects.toThrow('expired or changed')
  expect(presented).toHaveLength(0)
  expect((await loops.list())[0]?.promptCount).toBe(0)
})
it('applies quiet hours, recent activity, and a durable shared-store burst cap', async () => {
  const { clock, loops, loop, tasks, advance } = await setup()
  const presented: OpenLoop[] = []
  const notifier: ReminderNotifier = { notify: async () => {}, notifyOpenLoop: async (current, _signal, verify) => {
    await verify()
    presented.push(current)
  } }
  const policy = new ProactivePolicy()
  const source = new OpenLoopSource(loops, clock, 'UTC', policy, notifier, async () => true, () => {}, tasks)
  expect(policy.evaluateCandidate(loops.candidate(loop), Date.parse('2026-10-23T23:00:00Z'), 'UTC')).toMatchObject({ notify: false, reason: 'deferred' })
  await source.refresh(new AbortController().signal, { lastActivityAt: clock.now() }, [])
  expect(presented).toHaveLength(0)
  await source.refresh(new AbortController().signal, {}, [])
  expect(presented).toHaveLength(1)
  const second = (await loops.notice(extractOpenLoop('Tao chưa fix slide.', clock.now(), 'UTC')!, 'workspace', 'session', requestPrivacy('')))!
  advance(4)
  await source.refresh(new AbortController().signal, {}, [])
  expect(presented).toHaveLength(1)
  expect(await loops.claim(second.id)).toBeUndefined()
  advance(4)
  // 22:00 UTC is quiet. The persisted cap and quiet interval both survive a new source.
  await source.refresh(new AbortController().signal, {}, [])
  expect(presented).toHaveLength(1)
  advance(10)
  await source.refresh(new AbortController().signal, {}, [])
  expect(presented).toHaveLength(2)
})
