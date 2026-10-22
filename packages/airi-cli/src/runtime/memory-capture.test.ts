import type { GenerationProvider } from '@proj-airi/provider-inference'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Chat } from '../chat'
import { Memory } from '../memory'
import { RecallIndex } from '../recall-index'
import { AngelaRuntime } from './runtime'

const resources: { runtime: AngelaRuntime, directory: string }[] = []
afterEach(async () => {
  for (const { runtime, directory } of resources.splice(0)) {
    await runtime.close()
    await rm(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-capture-'))
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch: async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'I will remember the decision.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) } }) }
  const runtime = new AngelaRuntime('fixture', provider, cliMessages.en)
  resources.push({ runtime, directory })
  return { runtime, directory }
}

it('persists correlated sanitized events and an immediately searchable zero-provider episode through the real runtime', async () => {
  const { runtime, directory } = await setup()
  const sessionId = randomUUID()
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId, channel: 'telegram' })
  const ids = new Set<string>()
  const correlations = new Set<string>()
  const stop = runtime.events.on('user.message', (event) => {
    ids.add(event.id)
    correlations.add(event.correlationId)
  })
  runtime.events.on('assistant.message', (event) => {
    ids.add(event.id)
    correlations.add(event.correlationId)
  })
  await scope.send(new Chat(runtime.model, runtime.provider, directory), 'We decided to use SQLite for companion memory', {})
  await scope.close()
  stop()
  const index = await RecallIndex.open(directory)
  try {
    expect(index.memory.observations(directory, sessionId).some(item => item.type === 'user.message')).toBe(true)
    expect(index.search('SQLite companion', directory)[0]?.kind).toBe('episodic')
    expect(ids.size).toBe(2)
    expect(correlations.size).toBe(1)
  }
  finally {
    index.close()
  }
})

it('honors memory off and isolates identical sessions in different Telegram user stores', async () => {
  const { runtime, directory } = await setup()
  const sessionId = randomUUID()
  const firstDir = join(directory, 'user-one')
  const secondDir = join(directory, 'user-two')
  await new Memory(secondDir, cliMessages.en).setEnabled(false)
  for (const dataDir of [firstDir, secondDir]) {
    const scope = runtime.open({ dataDir, workspace: directory, sessionId, channel: 'telegram' })
    await scope.send(new Chat(runtime.model, runtime.provider, directory), 'The secret project codename is sunflower', {})
    await scope.close()
  }
  for (const [dataDir, count] of [[firstDir, 1], [secondDir, 0]] as const) {
    const index = await RecallIndex.open(dataDir)
    try {
      expect(index.search('sunflower', directory)).toHaveLength(count)
    }
    finally {
      index.close()
    }
  }
})

it('emits session boundaries only once across several requests and ends the session on release', async () => {
  const { runtime, directory } = await setup()
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'telegram' })
  let started = 0
  let ended = 0
  runtime.events.on('session.started', () => {
    started++
  })
  runtime.events.on('session.ended', () => {
    ended++
  })
  const chat = new Chat(runtime.model, runtime.provider, directory)
  await scope.send(chat, 'Choose SQLite for local memory', {})
  await scope.send(chat, 'Keep the architecture native', {})
  expect(started).toBe(1)
  expect(ended).toBe(0)
  await scope.close()
  expect(ended).toBe(1)
})
