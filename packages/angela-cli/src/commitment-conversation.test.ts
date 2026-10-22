import type { Conversation } from '@angela/core-agent'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns } from '@angela/core-agent'
import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { CommitmentConversation } from './commitment-conversation'
import { requestPrivacy } from './privacy-policy'
import { Tasks } from './tasks'

const directories: string[] = []
const now = Date.parse('2026-10-22T07:00:00+07:00')
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-commitment-'))
  directories.push(directory)
  const tasks = new Tasks(directory, cliMessages.vi.tasks, () => now, 'Asia/Ho_Chi_Minh')
  const service = new CommitmentConversation(tasks, cliMessages.vi.tasks, 'vi')
  const history: Conversation = { turns: [] }
  const send = async (text: string) => {
    const result = await service.handle(text, history, requestPrivacy(text))
    history.turns.push(...chatMessagesToTurns([{ role: 'user', content: text }, { role: 'assistant', content: result?.text ?? '' }]))
    return result
  }
  return { directory, tasks, service, history, send }
}

it('creates a persisted alarm, snoozes the same task, completes it and rejects further transitions', async () => {
  const { send, tasks, directory } = await setup()
  const created = await send('Mai 9h nhắc tao học LINQ.')
  expect(created?.task?.dueAt).toBe('2026-10-23T02:00:00.000Z')
  expect(await new Tasks(directory, cliMessages.vi.tasks).find(created!.task!.id)).toEqual(created!.task)
  const snoozed = await send('2 tiếng nữa nhắc lại.')
  expect(snoozed?.task?.id).toBe(created!.task!.id)
  expect(snoozed?.task?.snoozedUntil).toBe('2026-10-22T02:00:00.000Z')
  expect(snoozed?.task?.snoozeCount).toBe(1)
  expect((await send('Tao làm xong rồi.'))?.task?.status).toBe('completed')
  expect((await send('2 tiếng nữa nhắc lại.'))?.text).toBe(cliMessages.vi.tasks.inactive)
  expect(await tasks.list()).toHaveLength(0)
})

it('asks for a time without saving and uses the immediate time answer in the same conversation', async () => {
  const { send, tasks } = await setup()
  expect((await send('Thứ sáu nhớ nhắc tôi gửi báo cáo.'))?.text).toBe(cliMessages.vi.tasks.clarifyTime)
  expect(await tasks.list()).toHaveLength(0)
  const clarified = await send('9h')
  expect(clarified?.task?.title).toBe('gửi báo cáo')
  expect(clarified?.task?.dueAt).toBe('2026-10-23T02:00:00.000Z')
})

it('uses the latest announced task rather than a global pending-task selection', async () => {
  const { tasks, send, history } = await setup()
  const first = await tasks.create({ title: 'LINQ', type: 'reminder' })
  const second = await tasks.create({ title: 'Report', type: 'reminder' })
  history.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: `Tới giờ học LINQ rồi. ${first.id}` }]))
  expect((await send('Không cần nhắc cái đó nữa.'))?.task?.id).toBe(first.id)
  expect((await tasks.find(first.id)).status).toBe('cancelled')
  expect((await tasks.find(second.id)).status).toBe('pending')
})

it('asks which task after a batch notification, and rejects invalid snooze without mutation', async () => {
  const { send, tasks, history } = await setup()
  const first = await tasks.create({ title: 'First', type: 'reminder' })
  const second = await tasks.create({ title: 'Second', type: 'reminder' })
  history.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: `${first.id} ${second.id}` }]))
  expect((await send('Xong rồi.'))?.text).toBe(cliMessages.vi.tasks.clarifyTask)
  expect(await tasks.list()).toHaveLength(2)
  history.turns = []
  history.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: first.id }]))
  expect((await send('0 phút nữa nhắc lại.'))?.text).toBe(cliMessages.vi.tasks.invalidTime)
  expect(await tasks.find(first.id)).toEqual(first)
})

it('honors privacy before saving, and leaves weak intent to ordinary conversation', async () => {
  const { tasks, service, history } = await setup()
  const text = 'Mai 9h nhắc tao học LINQ. Đừng lưu.'
  expect((await service.handle(text, history, requestPrivacy(text)))?.text).toBe(cliMessages.vi.tasks.protected)
  expect(await tasks.list()).toHaveLength(0)
  expect(await service.handle('Mai chắc tao học LINQ', history, requestPrivacy(''))).toBeUndefined()
})

it('keeps a recent reference across an unrelated assistant reply', async () => {
  const { send, tasks, history } = await setup()
  const created = await send('Mai 9h nhắc tôi học LINQ')
  history.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: 'Bạn muốn cùng giải bài tập nào?' }]))
  expect((await send('Xong rồi.'))?.task?.id).toBe(created!.task!.id)
  expect((await tasks.find(created!.task!.id)).status).toBe('completed')
})

it('expires references after sustained unrelated conversation and refuses multiple recent tasks', async () => {
  const { send, tasks } = await setup()
  const created = await send('Mai 9h nhắc tôi học LINQ')
  for (let index = 0; index < 9; index++)
    await send(`Trao đổi về C# phần ${index}`)
  expect((await send('Xong rồi.'))?.text).toBe(cliMessages.vi.tasks.clarifyTask)
  expect((await tasks.find(created!.task!.id)).status).toBe('pending')
  await send('Mai 10h nhắc tôi làm auth')
  await send('Mai 11h nhắc tôi gửi báo cáo')
  expect((await send('Xong rồi.'))?.text).toBe(cliMessages.vi.tasks.clarifyTask)
  expect(await tasks.list()).toHaveLength(3)
})

it('does not mistake words in the control phrase for an explicitly named task', async () => {
  const { send, tasks } = await setup()
  const unrelated = await tasks.create({ title: 'rồi', type: 'todo' })
  const created = await send('Mai 9h nhắc tôi học LINQ')
  expect((await send('Xong rồi.'))?.task?.id).toBe(created!.task!.id)
  expect((await tasks.find(unrelated.id)).status).toBe('pending')
})

it('keeps explicitly requested task operations available with personal memory disabled', async () => {
  const { service, history, tasks } = await setup()
  const text = 'Mai 9h nhắc tôi học LINQ'
  const created = await service.handle(text, history, requestPrivacy(text, false))
  history.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: created!.text }]))
  const completed = await service.handle('Xong rồi.', history, requestPrivacy('Xong rồi.', false))
  expect(completed?.task?.status).toBe('completed')
  expect(await tasks.list()).toHaveLength(0)
})

it('resolves an explicit follow-up subject from this conversation and clarifies absent context', async () => {
  const { send, tasks } = await setup()
  expect((await send('Nhớ hỏi tôi lại chuyện này vào tối mai.'))?.text).toBe(cliMessages.vi.tasks.clarifyTask)
  await send('Tao đang làm auth mà bí phần refresh token.')
  const result = await send('Nhớ hỏi tôi lại chuyện này vào tối mai.')
  expect(result?.task).toMatchObject({ type: 'follow_up', title: 'làm auth mà bí phần refresh token.', dueAt: '2026-10-23T12:00:00.000Z' })
  expect(await tasks.list()).toHaveLength(1)
})
