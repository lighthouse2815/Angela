import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns } from '@angela/core-agent'
import { cliMessages } from '@angela/i18n/cli'
import { expect, it } from 'vitest'

import { ActiveCommitments } from './active-commitments'
import { Tasks } from './tasks'

it('recovers references by exact logical conversation and clears or expires them without touching tasks', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'angela-active-commitments-'))
  try {
    const now = Date.parse('2026-10-23T09:00:00Z')
    const tasks = new Tasks(dataDir, cliMessages.en.tasks, () => now, 'UTC')
    const task = await tasks.create({ title: 'Study', type: 'follow_up' })
    const scope = { dataDir, workspace: dataDir, sessionId: randomUUID(), channel: 'cli', messages: cliMessages.en.tasks }
    await new ActiveCommitments(scope).mention([task], 'notification', now)
    const resolve = async (reference: ActiveCommitments, at = now) => await reference.resolve({ turns: [] }, [task], at)
    expect(await resolve(new ActiveCommitments(scope))).toEqual([task])
    expect(await resolve(new ActiveCommitments({ ...scope, sessionId: randomUUID() }))).toEqual([])
    expect(await resolve(new ActiveCommitments({ ...scope, channel: 'telegram' }))).toEqual([])
    expect(await resolve(new ActiveCommitments({ ...scope, workspace: 'another-workspace' }))).toEqual([])
    expect(await resolve(new ActiveCommitments(scope), now + 7 * 3_600_000)).toEqual([])
    await new ActiveCommitments(scope).clear()
    expect(await resolve(new ActiveCommitments(scope))).toEqual([])
    expect((await tasks.find(task.id)).status).toBe('pending')
  }
  finally { await rm(dataDir, { recursive: true, force: true }) }
})

it('does not renew an expired conversation reference from another channel delivery clock or an oversized batch', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'angela-reference-boundary-'))
  try {
    const now = Date.parse('2026-10-23T09:00:00Z')
    const tasks = new Tasks(dataDir, cliMessages.en.tasks, () => now, 'UTC')
    const task = await tasks.create({ title: 'Study', type: 'reminder' })
    const scope = { dataDir, workspace: dataDir, sessionId: randomUUID(), channel: 'cli', messages: cliMessages.en.tasks }
    const active = new ActiveCommitments(scope)
    await active.mention([task], 'notification', now)
    const later = now + 7 * 3_600_000
    const sharedTask = { ...task, updatedAt: new Date(later).toISOString(), lastNotifiedAt: new Date(later).toISOString() }
    const history = { turns: chatMessagesToTurns([{ role: 'assistant', content: task.id }]) }
    expect(await active.resolve(history, [sharedTask], later)).toEqual([])
    const batch = Array.from({ length: 9 }, (_, index) => ({ ...task, id: randomUUID(), title: `Task ${index}` }))
    await active.mention(batch, 'notification', later)
    expect(await active.resolve({ turns: [] }, batch, later)).toEqual([])
  }
  finally { await rm(dataDir, { recursive: true, force: true }) }
})

it('resolves only the latest focus group and never falls back after its task becomes inactive', async () => {
  const now = Date.parse('2026-10-23T09:00:00Z')
  const active = new ActiveCommitments()
  const dataDir = await mkdtemp(join(tmpdir(), 'angela-focus-'))
  try {
    const tasks = new Tasks(dataDir, cliMessages.en.tasks, () => now, 'UTC')
    const older = await tasks.create({ title: 'Older', type: 'todo' })
    const latest = await tasks.create({ title: 'Latest', type: 'todo' })
    await active.mention([older], 'conversation', now)
    await active.mention([latest], 'notification', now)
    expect(await active.resolve({ turns: [] }, await tasks.list({ status: 'all' }), now)).toEqual([latest])
    await tasks.complete(latest.id)
    expect(await active.resolve({ turns: [] }, await tasks.list({ status: 'all' }), now)).toEqual([])
    await active.mention([older, latest], 'notification', now)
    expect(await active.resolve({ turns: [] }, await tasks.list({ status: 'all' }), now)).toEqual([])
  }
  finally { await rm(dataDir, { recursive: true, force: true }) }
})

it('keeps focus through unrelated replies, switches on a later named event, and preserves batch ambiguity', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'angela-named-focus-'))
  try {
    const now = Date.parse('2026-10-23T09:00:00Z')
    const tasks = new Tasks(dataDir, cliMessages.en.tasks, () => now, 'UTC')
    const first = await tasks.create({ title: 'Task A', type: 'todo' })
    const second = await tasks.create({ title: 'Task B', type: 'todo' })
    const active = new ActiveCommitments()
    await active.mention([first], 'notification', now)
    await active.mentionText('Java uses JVM.', [first, second], now)
    expect(await active.resolve({ turns: [] }, await tasks.list(), now)).toEqual([first])
    await tasks.complete(first.id)
    await active.mentionText('Task B thế nào?', [first, second], now)
    expect(await active.resolve({ turns: [] }, await tasks.list(), now)).toEqual([second])
    await active.mentionText('Task A và Task B tới đâu rồi?', [first, second], now)
    expect(await active.resolve({ turns: [] }, await tasks.list(), now)).toEqual([])
  }
  finally { await rm(dataDir, { recursive: true, force: true }) }
})

it('does not fall through a latest history focus containing a removed task ID', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'angela-missing-focus-'))
  try {
    const now = Date.parse('2026-10-23T09:00:00Z')
    const tasks = new Tasks(dataDir, cliMessages.en.tasks, () => now, 'UTC')
    const older = await tasks.create({ title: 'Older task', type: 'todo' })
    const history = { turns: chatMessagesToTurns([{ role: 'assistant', content: older.id }, { role: 'assistant', content: randomUUID() }]) }
    expect(await new ActiveCommitments().resolve(history, [older], now)).toEqual([])
  }
  finally { await rm(dataDir, { recursive: true, force: true }) }
})
