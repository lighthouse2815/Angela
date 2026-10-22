import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Recall } from './recall'
import { RecallIndex } from './recall-index'

const resources: { index: RecallIndex, recall: Recall, directory: string }[] = []
afterEach(async () => {
  for (const { index, recall, directory } of resources.splice(0)) {
    await recall.close()
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-context-relevance-'))
  const index = await RecallIndex.open(directory)
  const recall = new Recall(directory, directory, 'current', cliMessages.en, {}, { apiKey: '' })
  resources.push({ index, recall, directory })
  return { index, recall, directory }
}

it('does not inject or reinforce weak candidates while explicit search stays available', async () => {
  const { index, recall, directory } = await setup()
  const page = index.memory.write({ tier: 'semantic', kind: 'preference', key: 'coding', scope: directory, title: 'Coding preference', body: 'I prefer Python for automation.', authority: 'user' })
  await recall.start()
  expect(await recall.search('Python snake habitat', false, undefined, false)).toHaveLength(1)
  const prepared = await recall.prepare('Python snake habitat')
  expect(prepared.context).not.toContain(page.body)
  expect(index.memory.read(page.id, directory)?.accessCount).toBe(0)
  expect(await recall.command('/memory used')).not.toContain(`memory:${page.id}`)
})

it('preserves the context budget even when every candidate has matching evidence', async () => {
  const { index, recall, directory } = await setup()
  const page = index.memory.write({ tier: 'procedural', kind: 'workflow', key: 'restore', scope: directory, title: 'Archive restore', body: `Archive restore instructions ${'bounded archive restore procedure '.repeat(150)}`, authority: 'user' })
  await recall.start()
  await recall.command('/memory budget 2000')
  const prepared = await recall.prepare('archive restore')
  expect(prepared.context).not.toContain(`memory:${page.id}`)
  expect(index.memory.read(page.id, directory)?.accessCount).toBe(0)
})

it.each([
  'Bữa trước mình kể gì với bạn?',
  'hom truoc minh noi gi?',
  'Cuộc nói chuyện trước có nội dung gì?',
  'truoc do minh noi gi voi ban?',
  'What did we discuss in our previous conversation?',
])('recalls only the latest prior conversation for %s', async (query) => {
  const { index, recall, directory } = await setup()
  const archive = async (text: string, updatedAt: string, workspace = directory, id = randomUUID()) => {
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ version: 1, id, workspace, createdAt: updatedAt, updatedAt, interrupted: false, messages: [{ role: 'user', content: text }] }))
  }
  await archive('Previous conversation about a geometry worksheet.', '2026-01-01T00:00:00.000Z')
  await archive('We examined the telescope lens.', '2026-02-01T00:00:00.000Z')
  await archive('Private conversation in another class.', '2026-03-01T00:00:00.000Z', 'other-workspace')
  index.memory.write({ tier: 'semantic', kind: 'preference', key: 'chat', scope: directory, title: 'Conversation preference', body: 'I like conversations about geometry.', authority: 'user' })
  index.memory.write({ tier: 'episodic', kind: 'session', key: 'session:current', sourceSessionId: 'current', scope: directory, title: 'Current conversation', body: 'CurrentPrivateMarker', authority: 'episode' })
  await recall.start()
  const hits = await recall.search(query)
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every(hit => hit.kind === 'history')).toBe(true)
  expect(hits.some(hit => hit.text.includes('telescope lens'))).toBe(true)
  const prepared = await recall.prepare(query)
  expect(prepared.context).toContain('telescope lens')
  expect(prepared.context).not.toContain('geometry worksheet')
  expect(prepared.context).not.toContain('another class')
  expect(prepared.context).not.toContain('CurrentPrivateMarker')
})

it('supports episodic-only recaps without admitting ordinary semantic pages or current-session episodes', async () => {
  const { index, recall, directory } = await setup()
  index.memory.write({ tier: 'episodic', kind: 'session', key: 'session:previous', sourceSessionId: 'previous', scope: directory, title: 'Older conversation', body: 'We reviewed astronomy exercises.', authority: 'episode' }, '2026-01-01T00:00:00.000Z')
  index.memory.write({ tier: 'semantic', kind: 'preference', key: 'astronomy', scope: directory, title: 'Interest', body: 'I prefer astronomy exercises.', authority: 'user' }, '2026-02-01T00:00:00.000Z')
  await recall.start()
  expect((await recall.search('Lần trước mình nói gì?'))[0]?.text).toContain('We reviewed astronomy exercises.')
})

it('does not turn a topical reference to the past into a general recap', async () => {
  const { index, recall, directory } = await setup()
  index.memory.write({ tier: 'episodic', kind: 'session', key: 'session:older', sourceSessionId: 'older', scope: directory, title: 'Old session', body: 'We discussed the telescope lens.', authority: 'episode' }, '2026-01-01T00:00:00.000Z')
  index.memory.write({ tier: 'episodic', kind: 'session', key: 'session:newer', sourceSessionId: 'newer', scope: directory, title: 'New session', body: 'We discussed musical instruments.', authority: 'episode' }, '2026-02-01T00:00:00.000Z')
  await recall.start()
  const prepared = await recall.prepare('Lần trước mình nói gì về telescope lens?')
  expect(prepared.context).toContain('telescope lens')
  expect(prepared.context).not.toContain('musical instruments')
})

it('does not invent a recap when no prior session is eligible', async () => {
  const { index, recall, directory } = await setup()
  index.memory.write({ tier: 'semantic', kind: 'preference', key: 'general', scope: directory, title: 'General memory', body: 'Cuộc nói chuyện trước có nội dung về lịch sử.', authority: 'user' })
  await recall.start()
  expect(await recall.search('Cuộc nói chuyện trước có nội dung gì?')).toEqual([])
})
