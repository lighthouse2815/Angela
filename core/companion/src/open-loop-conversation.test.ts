import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { ActiveCommitments } from './active-commitments'
import { Memory } from './memory'
import { OpenLoopConversation } from './open-loop-conversation'
import { extractOpenLoop } from './open-loop-extraction'
import { OpenLoops } from './open-loops'
import { requestPrivacy } from './privacy-policy'
import { Tasks } from './tasks'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-dismissal-'))
  directories.push(directory)
  let now = Date.parse('2026-10-23T10:00:00Z')
  const clock = { now: () => now }
  const loops = new OpenLoops(directory, cliMessages.vi.tasks, clock)
  const tasks = new Tasks(directory, cliMessages.vi.tasks, clock, 'UTC')
  const active = new ActiveCommitments()
  const memory = new Memory(directory, cliMessages.vi)
  const notice = async (text: string, workspace = 'workspace-a') => (await loops.notice(extractOpenLoop(text, now, 'UTC')!, workspace, 'session', requestPrivacy(text)))!
  const auth = await notice('Auth vẫn lỗi.')
  const slide = await notice('Tao chưa làm xong slide.')
  const foreign = await notice('Auth vẫn lỗi.', 'workspace-b')
  await active.mentionReferences([{ kind: 'open_loop', id: auth.id }], 'notification', now)
  const conversation = new OpenLoopConversation(loops, active, tasks, 'workspace-a', 'session', cliMessages.vi.tasks, memory)
  return { loops, tasks, memory, active, auth, slide, foreign, conversation, advance: () => {
    now += 5 * 3_600_000
  } }
}

it.each([
  'Đừng hỏi vụ này nữa.',
  'Quên vụ auth đi.',
  'Quên chuyện auth đi.',
  'Đừng nhớ chuyện auth nữa.',
  'Đừng hỏi tôi về auth nữa.',
  'Đừng hỏi vụ auth nữa.',
  'Đừng nhắc chuyện auth nữa.',
  'Đừng hỏi về auth nữa.',
  'Không cần theo dõi vụ auth nữa.',
  'Bỏ vụ auth đi.',
])('stops only the visible matching thread for %s', async (text) => {
  const { loops, auth, slide, foreign, conversation, advance } = await setup()
  expect(await conversation.handle(text, requestPrivacy(text))).toBe(cliMessages.vi.tasks.openLoopDismissed)
  const saved = await loops.list()
  expect(saved.find(loop => loop.id === auth.id)?.state).toBe('dismissed')
  expect(saved.find(loop => loop.id === slide.id)?.state).toBe('open')
  expect(saved.find(loop => loop.id === foreign.id)?.state).toBe('open')
  advance()
  expect(await loops.claim(auth.id)).toBeUndefined()
})

it.each([false, true])('clarifies generic dismissal with ambiguous or absent focus (batch: %s)', async (batch) => {
  const { loops, auth, slide, active, conversation } = await setup()
  await active.clear()
  if (batch)
    await active.mentionReferences([{ kind: 'open_loop', id: auth.id }, { kind: 'open_loop', id: slide.id }], 'conversation', Date.parse(auth.createdAt))
  const text = 'Quên chuyện đó đi.'
  expect(await conversation.handle(text, requestPrivacy(text))).toBe(cliMessages.vi.tasks.clarifyOpenLoop)
  expect((await loops.list()).every(loop => loop.state === 'open')).toBe(true)
})

it('uses existing personal-memory forgetting for one matching fact and keeps unrelated memory', async () => {
  const { memory, loops, auth, conversation } = await setup()
  await memory.remember('Tôi đang học auth.')
  const unrelated = await memory.remember('Tôi thích cafe.')
  const text = 'Quên chuyện auth đi.'
  expect(await conversation.handle(text, requestPrivacy(text))).toBe(cliMessages.vi.tasks.openLoopDismissed)
  expect((await memory.read()).entries.map(entry => entry.id)).toEqual([unrelated])
  expect((await loops.list()).find(loop => loop.id === auth.id)?.state).toBe('dismissed')
})

it('dismisses proactive tracking without forgetting personal memory for a do-not-ask request', async () => {
  const { memory, conversation } = await setup()
  const fact = await memory.remember('Tôi đang học auth.')
  const text = 'Đừng hỏi về auth nữa.'
  expect(await conversation.handle(text, requestPrivacy(text))).toBe(cliMessages.vi.tasks.openLoopDismissed)
  expect((await memory.read()).entries.map(entry => entry.id)).toEqual([fact])
})

it('stops prompting but asks for memory selection when several personal records match', async () => {
  const { memory, loops, auth, conversation } = await setup()
  await memory.remember('Tôi đang học auth.')
  await memory.remember('Mục tiêu của tôi là hiểu auth.')
  const text = 'Quên vụ auth đi.'
  expect(await conversation.handle(text, requestPrivacy(text))).toContain('/memory')
  expect((await memory.read()).entries).toHaveLength(2)
  expect((await loops.list()).find(loop => loop.id === auth.id)?.state).toBe('dismissed')
})

it('honors explicit focused opt-out without persisting protected request activity', async () => {
  const { loops, auth, conversation } = await setup()
  const text = 'Đừng nhớ chuyện này nữa.'
  expect(requestPrivacy(text).durableMemoryAllowed).toBe(false)
  expect(await conversation.handle(text, requestPrivacy(text))).toBe(cliMessages.vi.tasks.openLoopDismissed)
  expect((await loops.list()).find(loop => loop.id === auth.id)?.state).toBe('dismissed')
  expect((await loops.activity()).lastActivityAt).toBeUndefined()
})

it.each(['Ví dụ user nói Quên vụ auth đi.', 'Nếu tôi nói quên vụ auth đi thì sao?', 'Xóa mọi thứ về auth.'])('does not broaden dismissal into destructive or meta requests: %s', async (text) => {
  const { loops, conversation } = await setup()
  expect(await conversation.handle(text, requestPrivacy(text))).toBeUndefined()
  expect((await loops.list()).every(loop => loop.state === 'open')).toBe(true)
})

it('leaves standalone personal forgetting to the existing flow when no active named thread matches', async () => {
  const { memory, loops, auth, foreign, conversation } = await setup()
  await memory.remember('Tôi đang học auth.')
  await loops.finish(auth.id, auth.workspace, 'resolved', requestPrivacy(''))
  const text = 'Quên vụ auth đi.'
  expect(await conversation.handle(text, requestPrivacy(text))).toBeUndefined()
  expect((await memory.read()).entries).toHaveLength(1)
  expect((await loops.list()).find(loop => loop.id === foreign.id)?.state).toBe('open')
})

it('keeps tracking dismissed and reports incomplete memory removal when the existing forget operation fails', async () => {
  const { memory, loops, auth, conversation } = await setup()
  await memory.remember('Tôi đang học auth.')
  vi.spyOn(memory, 'forget').mockRejectedValue(new Error('Personal storage unavailable'))
  const text = 'Quên vụ auth đi.'
  expect(await conversation.handle(text, requestPrivacy(text))).toContain('/memory')
  expect((await loops.list()).find(loop => loop.id === auth.id)?.state).toBe('dismissed')
  expect((await memory.read()).entries).toHaveLength(1)
})
