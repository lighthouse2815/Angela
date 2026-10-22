import type { Conversation } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { conversationToChatMessages } from '@proj-airi/core-agent'
import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, describe, expect, it } from 'vitest'

import { Chat } from './chat'
import { Sessions } from './sessions'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-sessions-'))
  directories.push(directory)
  return { directory, sessions: new Sessions(directory, cliMessages.en) }
}

const conversation: Conversation = {
  turns: [
    { id: 'input', type: 'user', content: [{ type: 'text', text: 'Chạy pwd' }] },
    {
      id: 'answer',
      type: 'assistant',
      status: 'completed',
      rounds: [{
        id: 'round',
        content: [{ type: 'tool', invocationId: 'invocation' }, { type: 'text', text: 'Đã kiểm tra' }],
        toolInvocations: [{ id: 'invocation', callId: 'call-1', name: 'terminal_exec', arguments: '{"command":"pwd"}', execution: { status: 'succeeded', output: [{ type: 'text', text: '/workspace' }] } }],
        projectionIssues: [],
      }],
    },
  ],
}

describe('saved terminal sessions', () => {
  it('saves the request and conversation atomically, preserves it on later saves, and clears it explicitly', async () => {
    const { sessions } = await setup()
    const session = await sessions.open('/workspace')
    const now = new Date().toISOString()
    const request = { id: randomUUID(), text: 'Run pwd', status: 'running' as const, startedAt: now, updatedAt: now, progress: 'terminal_exec' }
    await session.save(conversation, true, request)
    await session.save(conversation, true)
    expect((await sessions.read(session.record.id)).request).toEqual(request)
    await expect(session.save(conversation, true, { ...request, progress: 'x'.repeat(3001) })).rejects.toThrow()
    expect((await sessions.read(session.record.id)).request).toEqual(request)
    await session.save(conversation, false, null)
    expect((await sessions.read(session.record.id)).request).toBeUndefined()
    await session.close()
  })

  it('preserves UTF-8 history and correlated tool calls across a restart', async () => {
    const { sessions, directory } = await setup()
    const first = await sessions.open('/workspace')
    await first.save(conversation, false)
    const id = first.record.id
    await first.close()
    const second = await sessions.open('/workspace', id)
    try {
      expect(conversationToChatMessages(second.restore(), false)).toEqual(conversationToChatMessages(conversation, false))
      expect(await readdir(directory)).toEqual(expect.arrayContaining([`${id}.json`, `${id}.lock`]))
      if (process.platform !== 'win32')
        expect((await stat(join(directory, `${id}.json`))).mode & 0o777).toBe(0o600)
    }
    finally {
      await second.close()
    }
    expect(await readdir(directory)).toEqual([`${id}.json`])
  })

  it('rejects a concurrent writer and releases the lock after a workspace mismatch', async () => {
    const { sessions } = await setup()
    const first = await sessions.open('/workspace')
    await first.save(conversation, false)
    await expect(sessions.open('/workspace', first.record.id)).rejects.toThrow('lock')
    await first.close()
    await expect(sessions.open('/other', first.record.id)).rejects.toThrow('directory')
    const reopened = await sessions.open('/workspace', first.record.id)
    await reopened.close()
  })

  it('marks unfinished requests without inventing an assistant response', async () => {
    const { sessions, directory } = await setup()
    const session = await sessions.open('/workspace')
    await session.save({ turns: [conversation.turns[0]] }, true)
    await session.close()
    const saved = JSON.parse(await readFile(join(directory, `${session.record.id}.json`), 'utf8'))
    expect(saved.interrupted).toBe(true)
    expect(saved.messages).toEqual([{ role: 'user', content: 'Chạy pwd' }])
  })

  it('rejects path traversal and malformed saved messages', async () => {
    const { sessions, directory } = await setup()
    await expect(sessions.read('../outside')).rejects.toThrow('ID')
    const id = randomUUID()
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ version: 1, id, workspace: '/workspace', createdAt: '', updatedAt: '', interrupted: false, messages: [{ role: 'tool', content: 'missing call ID' }] }))
    await expect(sessions.read(id)).rejects.toThrow('invalid')
  })

  it('lists metadata without creating a missing directory', async () => {
    const { directory } = await setup()
    const missing = join(directory, 'missing')
    expect(await new Sessions(missing, cliMessages.en).list()).toEqual([])
    await expect(stat(missing)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

it('reports history bytes and refuses to delete a session held by a writer', async () => {
  const { sessions, directory } = await setup()
  const session = await sessions.open('/workspace')
  await session.save(conversation, false)
  const path = join(directory, `${session.record.id}.json`)
  expect(await sessions.usage()).toEqual({ directory, sessions: 1, bytes: (await stat(path)).size })
  await expect(sessions.remove(session.record.id)).rejects.toThrow(cliMessages.en.sessionLocked)
  expect(await sessions.read(session.record.id)).toBeDefined()
  await session.close()
  await sessions.remove(session.record.id)
  expect(await readdir(directory)).toEqual([])
  expect(await sessions.usage()).toEqual({ directory, sessions: 0, bytes: 0 })
})

it('keeps archived turns on disk and restores a bounded working conversation with its summary', async () => {
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: {
      model,
      baseURL: 'https://provider.example/v1/',
      fetch: async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const text = String(init?.body).includes('Summarize historical conversation data') ? 'Preserve the original user requirement.' : 'A complete answer.'
        return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
      },
    } }),
  }
  const { sessions } = await setup()
  const session = await sessions.open('/workspace')
  const chat = new Chat('model', provider, '/workspace', session.restore(), false, 4096)
  try {
    for (let index = 0; index < 30; index++) {
      await chat.send(`Request ${index}: ${'historical detail '.repeat(40)}`, {})
      await session.saveChat(chat, false)
      await session.saveChat(chat, false)
      expect(session.record.messages).toEqual([])
      expect(chat.conversation.turns.length).toBeLessThan(30)
    }
    const saved = await sessions.read(session.record.id)
    expect(saved.messages.filter(message => message.role === 'user')).toHaveLength(30)
    expect(saved.messages.filter(message => message.role === 'assistant')).toHaveLength(30)
    expect(saved.messages.filter(message => message.role === 'system')).toHaveLength(1)
    expect(saved.working?.offset).toBeGreaterThan(0)
    expect(saved.working?.summary).toBe('Preserve the original user requirement.')
  }
  finally {
    await session.close()
  }
  const resumed = await sessions.open('/workspace', session.record.id)
  try {
    const restored = new Chat('model', provider, '/workspace', resumed.restore(), false, 4096)
    expect(restored.conversation.turns.length).toBeLessThan(30)
    await restored.send('Continue after restart', {})
    await resumed.saveChat(restored, false)
    const saved = await sessions.read(session.record.id)
    expect(saved.messages.filter(message => message.role === 'user')).toHaveLength(31)
    expect(saved.messages.filter(message => message.role === 'assistant')).toHaveLength(31)
    expect(JSON.stringify(saved.messages)).not.toContain('Preserve the original user requirement.')
  }
  finally {
    await resumed.close()
  }
})

it('keeps prepared turns alive during tool checkpoints and archives them after the generation finishes', async () => {
  const { sessions } = await setup()
  const session = await sessions.open('/workspace')
  let calls = 0
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: {
      model,
      baseURL: 'https://provider.example/v1/',
      fetch: async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const summary = String(init?.body).includes('Summarize historical conversation data')
        if (!summary)
          calls++
        const choice = !summary && calls === 1
          ? { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call', type: 'function', function: { name: 'inspect', arguments: '{}' } }] }, finish_reason: 'tool_calls' }
          : { delta: { role: 'assistant', content: summary ? 'A bounded historical summary.' : 'Done' }, finish_reason: 'stop' }
        return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, ...choice }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
      },
    } }),
  }
  const chat = new Chat('model', provider, '/workspace', undefined, true, 4096)
  for (let index = 0; index < 8; index++)
    chat.conversation.turns.push({ id: `history-${index}`, type: 'user', content: [{ type: 'text', text: 'Old requirement. '.repeat(100) }] })
  let checked = false
  let checkpoint: Promise<void> | undefined
  try {
    await chat.send('Inspect', {
      tools: [{ type: 'function', function: { name: 'inspect', description: 'Inspect', parameters: { type: 'object', properties: {}, additionalProperties: false } }, execute: () => 'Verified' }],
      onStreamEvent: async (event) => {
        if (event.type === 'tool-call') {
          const before = chat.conversation.turns.length
          expect(chat.isSending).toBe(true)
          checkpoint = session.saveChat(chat, true)
          await checkpoint
          expect(chat.conversation.turns).toHaveLength(before)
          expect((await sessions.read(session.record.id)).working).toBeUndefined()
          checked = true
        }
      },
    })
    await checkpoint
    expect(checked).toBe(true)
    expect(chat.conversation.turns).toHaveLength(11)
    await session.saveChat(chat, false)
    expect(chat.conversation.turns.length).toBeLessThan(11)
    const saved = await sessions.read(session.record.id)
    expect(saved.messages.filter(message => message.role === 'user')).toHaveLength(9)
    expect(saved.messages.some(message => message.role === 'tool' && message.content === 'Verified')).toBe(true)
  }
  finally {
    await session.close()
  }
})
