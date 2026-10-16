import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LocalConfigFile } from '@proj-airi/local-config/node'
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
    env: { ...process.env, ANGELA_MODEL: 'test-model', ANGELA_API_KEY: '', ANGELA_API: 'chat-completions', ANGELA_DATA_DIR: directory, ANGELA_CONFIG: join(directory, 'config.json'), ...env },
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

it('reads shared credentials and piped UTF-8 input, then resumes the streamed conversation', async () => {
  const bodies: string[] = []
  const authorization: (string | undefined)[] = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += chunk
    bodies.push(body)
    authorization.push(request.headers.authorization)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Xin chào từ Angela' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const configDirectory = mkdtempSync(join(tmpdir(), 'angela-cli-shared-'))
  directories.push(configDirectory)
  const configPath = join(configDirectory, 'config.json')
  const apiKey = 'test-only-provider-secret'
  await new LocalConfigFile(configPath).update({
    providers: { local: { definitionId: 'openai-compatible', config: { baseUrl: `http://127.0.0.1:${address.port}/v1/`, apiKey }, status: 'configured' } },
    chat: { provider: 'local', model: 'shared-model' },
  })
  const env = { ANGELA_CONFIG: configPath, ANGELA_MODEL: undefined, ANGELA_BASE_URL: undefined, ANGELA_API_KEY: undefined, ANGELA_API: undefined, ANGELA_PROVIDER: undefined }
  const { child, result, directory } = run([], env)
  child.stdin.end('Chào Angela')
  const first = await result
  expect(first).toMatchObject({ code: 0, stdout: 'Xin chào từ Angela\n' })
  expect(bodies[0]).toContain('Chào Angela')
  expect(JSON.parse(bodies[0]).model).toBe('shared-model')
  expect(authorization[0]).toBe(`Bearer ${apiKey}`)
  expect(first.stderr).not.toContain(apiKey)
  const files = (await readdir(directory)).filter(file => file.endsWith('.json'))
  expect(files).toHaveLength(1)
  const sessionId = files[0].replace('.json', '')
  const stored = await readFile(join(directory, files[0]), 'utf8')
  expect(stored).not.toContain(apiKey)
  expect(first.stderr).toContain('Đã kết nối MCP')
  expect(JSON.parse(bodies[0]).tools).toEqual(expect.arrayContaining([
    expect.objectContaining({ function: expect.objectContaining({ name: 'builtIn_mcpCallTool' }) }),
  ]))
  const resumed = run(['--resume', sessionId, '--prompt', 'Bạn nhớ gì?'], { ...env, ANGELA_DATA_DIR: directory })
  expect(await resumed.result).toMatchObject({ code: 0 })
  expect(bodies[1]).toContain('Xin chào từ Angela')
  expect(bodies[1]).toContain('Bạn nhớ gì?')
  // Both CLI processes start and gracefully close the real built-in MCP service.
}, 15_000)

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

it('reports an empty provider answer instead of silently completing the request', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const { result } = run(['--prompt', 'Create a file'], { ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` })
  const output = await result
  expect(output.code).toBe(1)
  expect(output.stdout).toBe('')
  expect(output.stderr).toContain('Model không trả lời')
})

it('lists sessions without a model or provider credentials', async () => {
  const { child, result } = run(['--list-sessions'], { ANGELA_MODEL: '' })
  child.stdin.end()
  expect(await result).toMatchObject({ code: 0, stderr: '' })
})

// A provider failure rejects several SDK promises. Raw console diagnostics hid the final CLI error under repeated stacks.
it('shows a readable overload error without SDK stacks or provider response bodies', async () => {
  let requests = 0
  const server = createServer((_request, response) => {
    requests++
    response.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '0' })
    response.end(JSON.stringify({ error: { message: 'private-provider-response-test-secret', status: 'UNAVAILABLE' } }))
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const { result } = run(['--prompt', 'Hello'], { ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` })
  const output = await result
  expect(output.code).toBe(1)
  expect(output.stdout).toBe('')
  expect(output.stderr).toContain('HTTP 503')
  expect(output.stderr).toContain('quá tải')
  expect(output.stderr).not.toContain('APICallError')
  expect(output.stderr).not.toContain('Stream usage error')
  expect(output.stderr).not.toContain('private-provider-response-test-secret')
  expect(output.stderr.match(/Yêu cầu thất bại:/g)).toHaveLength(1)
  expect(output.stderr.match(/Đang thử lại/g)).toHaveLength(3)
  expect(requests).toBe(4)
})

it.each([
  { status: 401, locale: 'en', message: 'Check your API key and access permissions.' },
  { status: 429, locale: 'vi', message: 'Kiểm tra hạn mức' },
])('explains HTTP $status in locale $locale without echoing provider diagnostics', async ({ status, locale, message }) => {
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Retry-After': '0' })
    response.end(JSON.stringify({ error: { message: 'private-provider-diagnostics' } }))
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const { result } = run(['--prompt', 'Hello', '--locale', locale], { ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` })
  const output = await result
  expect(output.code).toBe(1)
  expect(output.stdout).toBe('')
  expect(output.stderr).toContain(`HTTP ${status}`)
  expect(output.stderr).toContain(message)
  expect(output.stderr).not.toContain('private-provider-diagnostics')
  expect(output.stderr).not.toContain('APICallError')
})
