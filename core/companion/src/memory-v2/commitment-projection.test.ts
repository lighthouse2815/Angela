import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it, vi } from 'vitest'

import { Recall } from '../recall'
import { RecallIndex } from '../recall-index'
import { Tasks } from '../tasks'

it('projects local transitions, repairs external writes, and preserves privacy and task state when memory fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-commitment-projection-'))
  const sessionId = randomUUID()
  let now = Date.parse('2026-10-22T08:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
  const recall = new Recall(directory, directory, sessionId, cliMessages.en, {}, { apiKey: '' }, undefined, undefined, { now: () => now })
  const index = await RecallIndex.open(directory)
  try {
    await recall.start()
    await recall.bindTasks(tasks)
    const task = await tasks.create({ title: 'LINQ', type: 'reminder', dueAt: '2026-10-23T09:00:00Z' }, await recall.commitmentSource())
    const page = () => index.memory.current(directory, 'episodic', `commitment:${task.id}`)!
    expect(JSON.parse(page().body).status).toBe('pending')
    const createdPage = page()
    now += 1000
    await tasks.snooze(task.id, '2026-10-24T09:00:00Z')
    expect(page().key).toBe(createdPage.key)
    expect(JSON.parse(page().body).remindAt).toBe('2026-10-24T09:00:00.000Z')
    expect(page().updatedAt).toBe(new Date(now).toISOString())
    expect(index.memory.read(createdPage.id, directory, true)?.status).toBe('superseded')
    const failure = vi.spyOn(recall, 'automaticMemoryEnabled').mockRejectedValue(new Error('Memory unavailable'))
    now += 1000
    await expect(tasks.complete(task.id)).resolves.toMatchObject({ status: 'completed' })
    expect(JSON.parse(page().body).status).toBe('pending')
    failure.mockRestore()
    await recall.repairCommitments(true)
    expect(JSON.parse(page().body).status).toBe('completed')
    expect(page().updatedAt).toBe(new Date(now).toISOString())
    const version = page().version
    await recall.repairCommitments(true)
    expect(page().version).toBe(version)

    const external = new Tasks(directory, cliMessages.en.tasks, () => now, 'UTC')
    const other = await external.create({ title: 'External follow-up', type: 'follow_up' }, { scope: directory, sourceSessionId: sessionId })
    expect(index.memory.current(directory, 'episodic', `commitment:${other.id}`)).toBeUndefined()
    now += 300_000
    await recall.repairCommitments()
    expect(index.memory.current(directory, 'episodic', `commitment:${other.id}`)).toBeDefined()
    now -= 60_000
    await tasks.cancel(other.id)
    expect(JSON.parse(index.memory.current(directory, 'episodic', `commitment:${other.id}`)!.body).status).toBe('cancelled')

    const privateTask = await tasks.create({ title: 'Explicit task with memory disabled', type: 'reminder' })
    await recall.repairCommitments(true)
    expect(index.memory.current(directory, 'episodic', `commitment:${privateTask.id}`)).toBeUndefined()
    index.memory.purge(page().id, directory)
    await recall.repairCommitments(true)
    expect(index.memory.current(directory, 'episodic', `commitment:${task.id}`)).toBeUndefined()
    expect((await tasks.find(task.id)).status).toBe('completed')
  }
  finally {
    await recall.close()
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
