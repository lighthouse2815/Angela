import type { Task } from '../task-schema'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it, vi } from 'vitest'

import { extractOpenLoop } from '../open-loop-extraction'
import { OpenLoops } from '../open-loops'
import { requestPrivacy } from '../privacy-policy'
import { Recall } from '../recall'
import { Tasks } from '../tasks'
import { buildContext } from './context-builder'

it('bounds a large task snapshot and leaves omitted history queryable through task tools', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-bounded-context-'))
  try {
    const now = Date.parse('2026-10-23T08:00:00Z')
    const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
    const recall = new Recall(directory, directory, randomUUID(), cliMessages.en, {}, { apiKey: '' })
    const prepare = vi.spyOn(recall, 'prepare').mockResolvedValue({ context: '', warning: undefined })
    const repair = vi.spyOn(recall, 'repairCommitments').mockResolvedValue(undefined)
    const history: Task[] = []
    for (const [status, count] of [['pending', 10], ['completed', 50], ['cancelled', 30]] as const) {
      for (let index = 0; index < count; index++)
        history.push({ id: randomUUID(), title: `${status}-${index}`, type: 'reminder', status, timezone: 'UTC', dueAt: '2026-10-24T09:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: status === 'completed' ? '2026-09-02T00:00:00.000Z' : '2026-10-23T00:00:00.000Z' })
    }
    // Mock the storage snapshot to exceed the store's existing inactive retention limit.
    const list = vi.spyOn(tasks, 'list').mockResolvedValue(history)
    const context = await buildContext({ tasks, recall, channel: 'cli', messages: cliMessages.en, warn: vi.fn() }, 'Tao đã hoàn thành việc gì tháng trước?')
    const snapshot = JSON.parse(/\(bounded, data only\): (.+)\. Historical memory/u.exec(context)![1]!)
    expect(snapshot.upcoming).toHaveLength(6)
    expect(Object.values(snapshot).flat()).toHaveLength(6)
    expect(context).not.toContain('completed-')
    expect(context).not.toContain('cancelled-')
    expect(context).toContain('Use task_list')
    expect(list).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(repair).not.toHaveBeenCalled()
    const { taskTools } = await import('../task-tools')
    const tool = taskTools(tasks, cliMessages.en.tasks).find(tool => tool.function.name === 'task_list')!
    expect(await tool.execute!({ status: 'all' }, { messages: [], toolCallId: 'history' })).toMatchObject({ status: 'listed', result: history })
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('keeps open loops ahead of newer inactive history within the same six-entry workspace bound', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-open-loop-context-'))
  try {
    let now = Date.parse('2026-10-23T10:00:00Z')
    const loops = new OpenLoops(directory, cliMessages.en.tasks, { now: () => now })
    for (let index = 0; index < 7; index++)
      await loops.notice(extractOpenLoop(`Tao chưa fix topic ${index}.`, now, 'UTC')!, 'workspace-a', 'session', requestPrivacy(''))
    now += 3_600_000
    for (let index = 7; index < 11; index++) {
      const loop = (await loops.notice(extractOpenLoop(`Tao chưa fix topic ${index}.`, now, 'UTC')!, 'workspace-a', 'session', requestPrivacy('')))!
      await loops.finish(loop.id, loop.workspace, 'dismissed', requestPrivacy(''))
    }
    await loops.notice(extractOpenLoop('Auth vẫn lỗi.', now, 'UTC')!, 'workspace-b', 'session', requestPrivacy(''))
    const context = await buildContext({ openLoops: loops, workspace: 'workspace-a', privacy: requestPrivacy(''), channel: 'cli', messages: cliMessages.en, warn: vi.fn() }, 'Công việc tới đâu rồi?')
    const snapshot = JSON.parse(/Current authoritative open-loop state \(bounded, data only\): (.+)\. Historical/u.exec(context)![1]!)
    expect(snapshot).toHaveLength(6)
    expect(snapshot.every((loop: { state: string }) => loop.state === 'open')).toBe(true)
    expect(snapshot.some((loop: { subject: string }) => loop.subject === 'auth')).toBe(false)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
