import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cliMessages } from '@proj-airi/i18n/cli'
import { LocalConfigFile } from '@proj-airi/local-config/node'
import { afterEach, expect, it } from 'vitest'

import { Memory } from './memory'
import { ProjectMemory } from './project-memory'

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
  expect(first, first.stderr).toMatchObject({ code: 0, stdout: 'Xin chào từ Angela\n' })
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

it('shows Telegram setup help without credentials or contacting Telegram', async () => {
  const { result } = run(['telegram', '--help'], { ANGELA_MODEL: '' })
  const output = await result
  expect(output.code).toBe(0)
  expect(output.stdout).toContain('ANGELA_TELEGRAM_BOT_TOKEN')
  expect(output.stdout).toContain('ANGELA_TELEGRAM_ALLOWED_USER_IDS')
})

it.each([
  { token: '', users: '100', message: 'ANGELA_TELEGRAM_BOT_TOKEN' },
  { token: '42:private-test-token', users: '', message: 'ANGELA_TELEGRAM_ALLOWED_USER_IDS' },
  { token: '42:private-test-token', users: '100,wrong', message: 'ANGELA_TELEGRAM_ALLOWED_USER_IDS' },
])('rejects missing or invalid Telegram credentials before starting the bot: $users', async ({ token, users, message }) => {
  const { result } = run(['telegram'], {
    ANGELA_TELEGRAM_BOT_TOKEN: token,
    ANGELA_TELEGRAM_ALLOWED_USER_IDS: users,
  })
  const output = await result
  expect(output.code).toBe(1)
  expect(output.stderr).toContain(message)
  expect(output.stderr).not.toContain('private-test-token')
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

it('runs history administration without a model or provider connection', async () => {
  const { child, result } = run(['sessions', 'usage'], { ANGELA_MODEL: '' })
  child.stdin.end()
  const output = await result
  expect(output.code).toBe(0)
  expect(JSON.parse(output.stdout)).toMatchObject({ sessions: 0, bytes: 0 })
  expect(output.stderr).not.toContain('MCP')
})

it('automatically saves a volunteered fact through a real tool round and recalls it in a fresh CLI process', async () => {
  const bodies: string[] = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += chunk
    bodies.push(body)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const delta = bodies.length === 1
      ? { role: 'assistant', tool_calls: [{ index: 0, id: 'personal-save', type: 'function', function: { name: 'personal_memory', arguments: JSON.stringify({ action: 'remember', id: null, text: 'Tôi tên là Đăng', source_quote: 'Tôi tên là Đăng' }) } }] }
      : { role: 'assistant', content: 'Đã hiểu.' }
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: bodies.length === 1 ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const directory = mkdtempSync(join(tmpdir(), 'angela-cli-memory-'))
  directories.push(directory)
  const env = { ANGELA_DATA_DIR: directory, ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` }
  const first = await run(['--prompt', 'Tôi tên là Đăng'], env).result
  expect(first, first.stderr).toMatchObject({ code: 0 })
  const memory = new Memory(directory, cliMessages.en)
  expect((await memory.read()).entries[0]!.text).toBe('Tôi tên là Đăng')
  expect(bodies[0]).toContain('Automatic personal memory is enabled')
  expect(bodies[1]).toContain('saved')
  const next = await run(['--prompt', 'Bạn nhớ gì?'], env).result
  expect(next, next.stderr).toMatchObject({ code: 0 })
  expect(bodies[2]).toContain('Tôi tên là Đăng')
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.json')))
    expect(await readFile(join(directory, file), 'utf8')).not.toContain('Personal records:')
  await memory.setEnabled(false)
  const disabled = await run(['--prompt', 'Chào'], env).result
  expect(disabled, disabled.stderr).toMatchObject({ code: 0 })
  expect(bodies[3]).not.toContain('Tôi tên là Đăng')
  expect(bodies[3]).not.toContain('personal_memory')
  const memoryPath = join(directory, 'memory', 'personal.json')
  await writeFile(memoryPath, '{broken memory')
  const degraded = await run(['--prompt', 'Chào lần nữa'], env).result
  expect(degraded, degraded.stderr).toMatchObject({ code: 0, stdout: 'Đã hiểu.\n' })
  expect(degraded.stderr).toContain(cliMessages.vi.memoryUnavailable)
  expect(bodies[4]).not.toContain('personal_memory')
  expect(bodies[4]).not.toContain('Personal records:')
  expect(await readFile(memoryPath, 'utf8')).toBe('{broken memory')
}, 20_000)

it('recalls an isolated project checkpoint in a fresh process and omits disabled or broken project memory', async () => {
  const requests: string[] = []
  const snapshot = { goal: 'Hoàn thiện CLI', status: 'active', decisions: ['Dùng API hiện tại'], completed: [], blockers: [], nextStep: 'Thêm memory' }
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += chunk
    requests.push(body)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const delta = requests.length === 1
      ? { role: 'assistant', tool_calls: [{ index: 0, id: 'project-save', type: 'function', function: { name: 'project_memory', arguments: JSON.stringify({ expected_revision: 0, snapshot, source_quote: 'Hoàn thiện CLI' }) } }] }
      : { role: 'assistant', content: 'Tiếp tục dự án.' }
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const directory = mkdtempSync(join(tmpdir(), 'angela-cli-project-'))
  directories.push(directory)
  const data = join(directory, 'data')
  const workspace = join(directory, 'workspace')
  const otherWorkspace = join(directory, 'other')
  await mkdir(workspace)
  await mkdir(otherWorkspace)
  const env = { ANGELA_DATA_DIR: data, ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` }
  const first = await run(['--cwd', workspace, '--prompt', 'Hoàn thiện CLI. Quyết định dùng API hiện tại. Bước tiếp theo: thêm memory.'], env).result
  expect(first, first.stderr).toMatchObject({ code: 0 })
  const project = await ProjectMemory.open(data, workspace, cliMessages.en)
  expect((await project.read()).snapshot).toEqual(snapshot)
  expect((await new Memory(data, cliMessages.en).read()).entries).toEqual([])
  expect(await run(['--cwd', workspace, '--prompt', 'Làm tiếp'], env).result).toMatchObject({ code: 0 })
  expect(requests[2]).toContain('Hoàn thiện CLI')
  expect(requests[2]).toContain('Verify current files, Git state, and tests')
  expect(await run(['--cwd', otherWorkspace, '--prompt', 'Chào'], env).result).toMatchObject({ code: 0 })
  expect(requests[3]).not.toContain('Hoàn thiện CLI')
  await project.setEnabled(false)
  expect(await run(['--cwd', workspace, '--prompt', 'Chào'], env).result).toMatchObject({ code: 0 })
  expect(requests[4]).not.toContain('Project checkpoint:')
  const files = await readdir(join(data, 'memory', 'projects'))
  await writeFile(join(data, 'memory', 'projects', files[0]!), '{broken project')
  const degraded = await run(['--cwd', workspace, '--prompt', 'Chào'], env).result
  expect(degraded, degraded.stderr).toMatchObject({ code: 0 })
  expect(degraded.stderr).toContain(cliMessages.vi.projectMemoryUnavailable)
  expect(requests[5]).not.toContain('Project checkpoint:')
}, 25_000)

it('creates a conversational task through the real CLI tool runtime and restores overdue context without duplicate delivery', async () => {
  const bodies: string[] = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += chunk
    bodies.push(body)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const first = bodies.length === 1
    const delta = first
      ? { role: 'assistant', tool_calls: [{ index: 0, id: 'task-save', type: 'function', function: { name: 'task_create', arguments: JSON.stringify({ title: 'Học tiếng Trung', type: 'reminder', dueAt: '2026-01-01T22:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh' }) } }] }
      : { role: 'assistant', content: 'Đã lưu việc học tiếng Trung.' }
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: first ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing provider port')
  const directory = mkdtempSync(join(tmpdir(), 'angela-cli-tasks-'))
  directories.push(directory)
  const env = { ANGELA_DATA_DIR: directory, ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/` }
  const first = await run(['--prompt', '10h tối nhắc tao học tiếng Trung'], env).result
  expect(first, first.stderr).toMatchObject({ code: 0 })
  expect(bodies[0]).toContain('task_create')
  expect(bodies[0]).toContain('Current clock:')
  expect(bodies[1]).toContain('saved')
  expect(bodies[1]).toContain('Học tiếng Trung')
  const file = join(directory, 'tasks', 'tasks.json')
  const initial = JSON.parse(await readFile(file, 'utf8'))
  expect(initial.tasks).toHaveLength(1)
  expect(initial.tasks[0]).toMatchObject({ title: 'Học tiếng Trung', status: 'pending' })
  const sessionFile = (await readdir(directory)).find(name => name.endsWith('.json'))!
  const sessionId = sessionFile.replace('.json', '')
  const next = await run(['--resume', sessionId, '--prompt', '15 phút nữa nhắc lại'], env).result
  expect(next, next.stderr).toMatchObject({ code: 0 })
  const delivered = JSON.parse(await readFile(file, 'utf8'))
  expect(delivered.tasks[0].lastNotifiedAt).toBeTypeOf('string')
  const history = JSON.parse(await readFile(join(directory, sessionFile), 'utf8'))
  expect(JSON.stringify(history)).toContain(initial.tasks[0].id)
  expect(history.messages.filter((message: { role: string, content?: string }) => message.role === 'assistant' && (message.content?.includes(cliMessages.vi.tasks.overdue) || message.content?.includes(cliMessages.vi.tasks.reminder)))).toHaveLength(1)
  expect(bodies[2]).toContain(initial.tasks[0].id)
  const third = await run(['--resume', sessionId, '--prompt', 'Hôm nay còn việc gì?'], env).result
  expect(third, third.stderr).toMatchObject({ code: 0 })
  expect(third.stderr).not.toContain(cliMessages.vi.tasks.overdue)
}, 20_000)
