import type { ExternalMessageRecord } from './away-types'

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

import { LocalAwayModeStore } from './away-mode-store'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'angela-away-retention-'))
  directories.push(root)
  const directory = join(root, createHash('sha256').update('111').digest('hex'))
  return { root, directory, store: new LocalAwayModeStore(root, '111') }
}

function record(key: string, timestamp = Date.now()): ExternalMessageRecord {
  return {
    id: createHash('sha256').update(key).digest('hex'),
    channel: 'zalo',
    source: 'zalo',
    sourceType: 'external-user',
    accountId: '111',
    senderId: '222',
    conversationId: '222',
    messageId: key,
    text: 'External request, never owner intent',
    receivedAt: new Date(timestamp).toISOString(),
    isSelf: false,
    replyStatus: 'received',
  }
}

it('expires terminal records after 30 days while preserving unfinished and recent dedup claims', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const { store, directory } = await setup()
  const terminal = record('old-terminal')
  const active = record('old-active')
  await store.claim(terminal)
  await store.update(terminal.id, { replyStatus: 'sent', processedAt: terminal.receivedAt })
  await store.claim(active)
  await store.update(active.id, { replyStatus: 'sending' })
  vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60_000)
  const recent = record('recent')
  await store.claim(recent)
  await store.update(recent.id, { replyStatus: 'sent' })
  await store.maintain()
  expect((await store.records()).map(item => item.id).sort()).toEqual([active.id, recent.id].sort())
  expect(await readdir(join(directory, 'messages'))).not.toContain(`${terminal.id}.json`)
  const restarted = new LocalAwayModeStore(directories[0]!, '111')
  await restarted.maintain()
  expect(await restarted.claim(recent)).toBe(false)
  expect(await restarted.claim(active)).toBe(false)
})

it('evicts oldest terminal records deterministically at capacity and never evicts recent or active claims', async () => {
  const { store, directory } = await setup()
  const old = Date.now() - 7 * 60_000
  const fixtures = Array.from({ length: 500 }, (_, index) => ({ ...record(String(index), old + index), replyStatus: 'sent' as const }))
  const active = { ...fixtures[0]!, replyStatus: 'sending' as const }
  const recent = { ...fixtures[499]!, receivedAt: new Date().toISOString() }
  const records = [active, ...fixtures.slice(1, 499), recent]
  await mkdir(join(directory, 'messages'), { recursive: true })
  await Promise.all(records.map(value => writeFile(join(directory, 'messages', `${value.id}.json`), JSON.stringify({ record: value }))))
  await store.maintain()
  expect(await store.claim(record('new'))).toBe(true)
  const retained = await store.records()
  expect(retained).toHaveLength(500)
  expect(retained.some(item => item.id === fixtures[1]!.id)).toBe(false)
  expect(retained.some(item => item.id === active.id)).toBe(true)
  expect(await store.claim(recent)).toBe(false)
  expect(await readdir(join(directory, 'messages'))).toHaveLength(500)
})

it('fails closed at capacity when every record still protects recent deduplication', async () => {
  const { store, directory } = await setup()
  await mkdir(join(directory, 'messages'), { recursive: true })
  await Promise.all(Array.from({ length: 500 }, (_, index) => {
    const value = { ...record(String(index)), replyStatus: 'sent' }
    return writeFile(join(directory, 'messages', `${value.id}.json`), JSON.stringify({ record: value }))
  }))
  expect(await store.claim(record('overflow'))).toBe(false)
  expect(await readdir(join(directory, 'messages'))).toHaveLength(500)
})

it('retains rate reservations across restart, separates senders and accounts, and expires only elapsed windows', async () => {
  const { root, store } = await setup()
  const now = Date.now()
  expect(await store.reserveReply('222', now)).toBe(true)
  expect(await store.reserveReply('222', now)).toBe(true)
  expect(await store.reserveReply('222', now)).toBe(true)
  const restarted = new LocalAwayModeStore(root, '111')
  expect(await restarted.reserveReply('222', now + 59_999)).toBe(false)
  expect(await restarted.reserveReply('333', now)).toBe(true)
  expect(await new LocalAwayModeStore(root, '444').reserveReply('222', now)).toBe(true)
  expect(await restarted.reserveReply('222', now + 60_000)).toBe(true)
})

it('seeds the rate file once from pre-existing sent or uncertain attempts', async () => {
  const { store } = await setup()
  for (let index = 0; index < 3; index++) {
    const value = record(String(index))
    await store.claim(value)
    await store.update(value.id, { replyStatus: index === 2 ? 'sending' : 'sent', processedAt: new Date().toISOString() })
  }
  expect(await store.reserveReply('222', Date.now())).toBe(false)
})

it('caps rate state without evicting live sender windows', async () => {
  const { store, directory } = await setup()
  const now = Date.now()
  for (let index = 0; index < 512; index++)
    expect(await store.reserveReply(String(index), now)).toBe(true)
  expect(await store.reserveReply('9999', now)).toBe(false)
  const state = JSON.parse(await readFile(join(directory, 'reply-rates.json'), 'utf8'))
  expect(state.windows).toHaveLength(512)
  expect(await store.reserveReply('999', now + 60_000)).toBe(true)
  expect(JSON.parse(await readFile(join(directory, 'reply-rates.json'), 'utf8')).windows).toHaveLength(1)
})

it('keeps twenty recent contact IDs with metadata only, independent of account and display name', async () => {
  const { root, store, directory } = await setup()
  const now = Date.now()
  for (let index = 0; index < 25; index++)
    await store.observeContact({ ...record(String(index), now + index), senderId: String(1000 + index), senderName: 'Same display name' })
  const recent = await store.recentContacts()
  expect(recent).toHaveLength(20)
  expect(recent[0]).toMatchObject({ senderId: '1024', messageCount: 1 })
  expect(recent.map(contact => contact.senderId)).not.toContain('1000')
  await store.observeContact({ ...record('again', now + 30), senderId: '1020', senderName: 'Renamed contact' })
  expect((await new LocalAwayModeStore(root, '111').recentContacts())[0]).toMatchObject({ senderId: '1020', senderName: 'Renamed contact', messageCount: 2 })
  expect(await new LocalAwayModeStore(root, '444').recentContacts()).toEqual([])
  expect(await readFile(join(directory, 'recent-contacts.json'), 'utf8')).not.toContain('External request')
})
