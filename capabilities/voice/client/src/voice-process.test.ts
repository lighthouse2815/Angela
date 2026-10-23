import process from 'node:process'

import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { Voice } from './voice'

let directory: string
const pids: number[] = []
const servers: { close: () => void }[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-audio-process-'))
  // These executables replace only the PipeWire boundary. They never open a physical audio device.
  for (const name of ['pw-record', 'pw-play']) {
    await writeFile(join(directory, name), `#!${process.execPath}
import { writeFileSync } from 'node:fs'
process.on('SIGINT', () => {})
process.on('SIGTERM', () => {})
writeFileSync(process.env.TEST_AUDIO_PID, String(process.pid))
if (process.argv[1].endsWith('pw-record')) process.stdout.write(Buffer.alloc(640))
setInterval(() => {}, 1000)
`, { mode: 0o700 })
  }
  vi.stubEnv('PATH', `${directory}${delimiter}${process.env.PATH}`)
  vi.stubEnv('TEST_AUDIO_PID', join(directory, 'pid'))
})

afterEach(async () => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL')
    }
    catch { /* The voice owner normally stops the fixture before this cleanup. */ }
  }
  for (const server of servers.splice(0))
    server.close()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

async function audioPid() {
  let pid = 0
  await vi.waitFor(async () => {
    pid = Number(await readFile(join(directory, 'pid'), 'utf8'))
    expect(pid).toBeGreaterThan(0)
  }, { timeout: 5000 })
  pids.push(pid)
  return pid
}

it('cancels a recorder that ignores SIGINT and releases it before the next capture', async () => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  servers.push(server)
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing server address')
  const received = Promise.withResolvers<void>()
  server.on('connection', socket => socket.on('message', (_data, binary) => {
    if (binary)
      received.resolve()
    else socket.send(JSON.stringify({ type: 'ready' }))
  }))
  const voice = new Voice({ ...process.env, ANGELA_VOICE_BASE_URL: `http://127.0.0.1:${address.port}/v1/` }, cliMessages.en)
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const result = voice.listen(undefined, controller.signal, () => {}).catch(error => error)
    if (attempt === 0)
      await received.promise
    const pid = await audioPid()
    const started = Date.now()
    controller.abort(new Error('cancel capture'))
    try {
      const outcome = await Promise.race([result, setTimeout(3500, 'timeout')])
      expect(outcome).toBeInstanceOf(Error)
      expect(Date.now() - started).toBeLessThan(3000)
      expect(() => process.kill(pid, 0)).toThrow()
    }
    finally {
      try {
        process.kill(pid, 'SIGKILL')
      }
      catch { /* The child has already exited after successful cancellation. */ }
      await result
      await rm(join(directory, 'pid'), { force: true })
    }
  }
}, 20_000)

it('waits for an interrupted player to exit before releasing playback ownership', async () => {
  const server = createServer((_request, response) => response.end(new Uint8Array([82, 73, 70, 70])))
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing server address')
  const voice = new Voice({ ...process.env, ANGELA_VOICE_BASE_URL: `http://127.0.0.1:${address.port}/v1/` }, cliMessages.en)
  const controller = new AbortController()
  const result = voice.speak('Xin chào', controller.signal).catch(error => error)
  const pid = await audioPid()
  controller.abort(new Error('interrupt playback'))
  const outcome = await result
  expect(outcome).toBeInstanceOf(Error)
  expect(() => process.kill(pid, 0)).toThrow()
}, 12_000)
