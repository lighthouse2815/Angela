import type { Conversation } from '@proj-airi/core-agent'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { conversationToChatMessages } from '@proj-airi/core-agent'
import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, describe, expect, it } from 'vitest'

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
