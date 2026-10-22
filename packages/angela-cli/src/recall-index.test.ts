import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { RecallIndex } from './recall-index'

const resources: { index: RecallIndex, directory: string }[] = []
afterEach(async () => {
  for (const { index, directory } of resources.splice(0)) {
    index.close()
    await rm(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-relevance-'))
  const index = await RecallIndex.open(directory)
  resources.push({ index, directory })
  return index
}

it('rejects a solitary weak lexical candidate even when it ranks first', async () => {
  const index = await setup()
  index.memory.write({ tier: 'semantic', kind: 'fact', key: 'garden', scope: 'workspace', title: 'Garden', body: 'Cây bưởi sau nhà đã có quả.', authority: 'user' })
  expect(index.search('Cây đỏ đen cân bằng như thế nào?', 'workspace')).toHaveLength(1)
  expect(index.search('Cây đỏ đen cân bằng như thế nào?', 'workspace', undefined, undefined, '', true)).toEqual([])
})

it('keeps diagnostic lookups and corroborated multiword evidence eligible for context', async () => {
  const index = await setup()
  const page = index.memory.write({ tier: 'episodic', kind: 'event', key: 'incident', scope: 'workspace', title: 'Incident', body: 'ERR_CONNECTION_RESET interrupted the backup transfer.', authority: 'episode' })
  expect(index.search('ERR_CONNECTION_RESET', 'workspace', undefined, undefined, '', true)[0]?.id).toBe(`memory:${page.id}`)
  expect(index.search('backup transfer failure', 'workspace', undefined, undefined, '', true)[0]?.id).toBe(`memory:${page.id}`)
})

it('requires independent query evidence rather than high authority or many weak documents', async () => {
  const index = await setup()
  for (let n = 0; n < 20; n++)
    index.memory.write({ tier: 'semantic', kind: 'fact', key: `weak-${n}`, scope: 'workspace', title: 'Personal fact', body: `Python is my preferred programming language number ${n}.`, authority: 'user' })
  expect(index.search('Python snake natural habitat', 'workspace', undefined, undefined, '', true)).toEqual([])
  const exact = index.memory.write({ tier: 'episodic', kind: 'event', key: 'wildlife', scope: 'workspace', title: 'Wildlife notes', body: 'Python snake natural habitat includes tropical forests.', authority: 'episode' })
  expect(index.search('Python snake natural habitat', 'workspace', undefined, undefined, '', true)[0]?.id).toBe(`memory:${exact.id}`)
})

it('accepts corroborating semantic evidence without lexical overlap and rejects subthreshold vectors', async () => {
  const index = await setup()
  const page = index.memory.write({ tier: 'semantic', kind: 'fact', key: 'reading', scope: 'workspace', title: 'Reading', body: 'I read mysteries during the weekend.', authority: 'user' })
  index.vectors('fixture', [{ id: `memory:${page.id}`, version: page.version, vector: Float32Array.from([1, 0]) }])
  expect(index.search('leisure books', 'workspace', 'fixture', Float32Array.from([1, 0]), '', true)[0]?.id).toBe(`memory:${page.id}`)
  expect(index.search('leisure books', 'workspace', 'fixture', Float32Array.from([0, 1]), '', true)).toEqual([])
  expect(index.search('leisure books', 'another-workspace', 'fixture', Float32Array.from([1, 0]), '', true)).toEqual([])
})
