import { mkdtemp, rm } from 'node:fs/promises'
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
