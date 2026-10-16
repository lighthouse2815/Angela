import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, expect, it } from 'vitest'

const children: ReturnType<typeof spawn>[] = []
const servers: ReturnType<typeof createServer>[] = []
const directories: string[] = []

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await once(child, 'close')
    }
  }
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'angela-cli-test-'))
  directories.push(directory)
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./bin/run.ts', import.meta.url)), ...args], {
    env: { ...process.env, ANGELA_MODEL: 'test-model', ANGELA_API_KEY: '', ANGELA_API: 'chat-completions', ANGELA_DATA_DIR: directory, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => stdout += chunk)
  child.stderr.on('data', chunk => stderr += chunk)
  const result = once(child, 'close').then(([code]) => ({ code, stdout, stderr }))
  return { child, result, directory }
}

it('reads piped UTF-8 input and streams a provider response through the CLI', async () => {
  const bodies: string[] = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += chunk
    bodies.push(body)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Xin chào từ Angela' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const env = { ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/`, ANGELA_API_KEY: 'test-only-provider-secret' }
  const { child, result, directory } = run([], env)
  child.stdin.end('Chào Angela')
  const first = await result
  expect(first).toMatchObject({ code: 0, stdout: 'Xin chào từ Angela\n' })
  expect(bodies[0]).toContain('Chào Angela')
  const files = await readdir(directory)
  expect(files).toHaveLength(1)
  const sessionId = files[0].replace('.json', '')
  const stored = await readFile(join(directory, files[0]), 'utf8')
  expect(stored).not.toContain(env.ANGELA_API_KEY)
  const resumed = run(['--resume', sessionId, '--prompt', 'Bạn nhớ gì?'], { ...env, ANGELA_DATA_DIR: directory })
  expect(await resumed.result).toMatchObject({ code: 0 })
  expect(bodies[1]).toContain('Xin chào từ Angela')
  expect(bodies[1]).toContain('Bạn nhớ gì?')
})

it('returns exit code 130 after SIGINT cancels the active provider request', async () => {
  const server = createServer((_request, response) => response.writeHead(200, { 'Content-Type': 'text/event-stream' }))
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const requested = once(server, 'request')
  const { child, result } = run(['--prompt', 'Wait'], { ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` })
  await requested
  child.kill('SIGINT')
  expect(await result).toMatchObject({ code: 130 })
})

it('rejects empty input without calling a provider', async () => {
  const { child, result } = run([])
  child.stdin.end()
  expect(await result).toMatchObject({ code: 1, stdout: '' })
})

it('lists sessions without a model or provider credentials', async () => {
  const { child, result } = run(['--list-sessions'], { ANGELA_MODEL: '' })
  child.stdin.end()
  expect(await result).toMatchObject({ code: 0, stderr: '' })
})
