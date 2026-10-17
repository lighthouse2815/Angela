import type { Message } from '@xsai/shared-chat'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Tasks } from './tasks'

const directories: string[] = []
const children: ReturnType<typeof spawn>[] = []
const servers: ReturnType<typeof createServer>[] = []
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

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-conversation-'))
  directories.push(directory)
  const requests: { messages: Message[], tools: { function: { name: string } }[] }[] = []
  const calls: { name: string, input: Record<string, unknown> }[] = []
  const server = createServer(async (request, response) => {
    let source = ''
    for await (const chunk of request)
      source += chunk
    const body: (typeof requests)[number] = JSON.parse(source)
    requests.push(body)
    const userIndex = body.messages.findLastIndex(message => message.role === 'user')
    const text = body.messages[userIndex]?.content
    const toolResults = body.messages.slice(userIndex + 1).filter(message => message.role === 'tool')
    const result = toolResults.at(-1)
    const call = (name: string, input: Record<string, unknown>) => {
      calls.push({ name, input })
      return { role: 'assistant', tool_calls: [{ index: 0, id: `task-${calls.length}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] }
    }
    let delta: object = { role: 'assistant', content: 'Đã xử lý.' }
    if (text === '10h tối nhắc tao học tiếng Trung' && !result) {
      delta = call('task_create', { title: 'Học tiếng Trung', type: 'reminder', dueAt: '2099-10-17T22:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh' })
    }
    else if (text === 'dời nó sang 9h' || text === 'dời cái đó sang 9h' || text === 'xong rồi' || text === '15 phút nữa nhắc lại') {
      if (!result) {
        delta = call('task_list', {})
      }
      else if (toolResults.length === 1) {
        const listed: { status: string, result: { id: string }[] } = JSON.parse(String(result.content))
        if (listed.result.length !== 1) {
          delta = { role: 'assistant', content: 'Có hai việc phù hợp. Bạn muốn dời việc nào?' }
        }
        else {
          const id = listed.result[0]!.id
          if (text === 'xong rồi')
            delta = call('task_complete', { id })
          else if (text === '15 phút nữa nhắc lại')
            delta = call('task_snooze', { id, duration: '15m' })
          else
            delta = call('task_update', { id, changes: { dueAt: '2099-10-17T21:00:00+07:00' } })
        }
      }
    }
    const tool = 'tool_calls' in delta
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing stub port')
  const baseUrl = `http://127.0.0.1:${address.port}/v1/`
  let sessionId: string | undefined
  async function send(text: string) {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./bin/run.ts', import.meta.url)), '--prompt', text, ...(sessionId ? ['--resume', sessionId] : [])], {
      env: { ...process.env, ANGELA_MODEL: 'task-stub', ANGELA_API_KEY: '', ANGELA_API: 'chat-completions', ANGELA_BASE_URL: baseUrl, ANGELA_DATA_DIR: directory, ANGELA_CONFIG: join(directory, 'config.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => stdout += chunk)
    child.stderr.on('data', chunk => stderr += chunk)
    const [code] = await once(child, 'close')
    expect(code, stderr).toBe(0)
    sessionId ??= /(?:Phiên|Session): ([\da-f-]{36})/u.exec(stderr)?.[1]
    expect(sessionId).toBeDefined()
    return { stdout, stderr }
  }
  return { directory, tasks: new Tasks(directory, cliMessages.en.tasks), send, calls, requests }
}

it('flow A: resumes a conversation, lists tasks, and updates the same stable ID', async () => {
  const { tasks, send, calls, requests } = await setup()
  await send('10h tối nhắc tao học tiếng Trung')
  const task = (await tasks.list())[0]!
  await send('dời nó sang 9h')
  expect(calls.map(call => call.name)).toEqual(['task_create', 'task_list', 'task_update'])
  expect(calls[2]!.input.id).toBe(task.id)
  expect((await tasks.find(task.id)).dueAt).toBe('2099-10-17T14:00:00.000Z')
  expect(JSON.stringify(requests.at(-1)?.messages)).toContain('10h tối nhắc tao học tiếng Trung')
}, 20_000)

it('flow B: includes the delivered reminder in context and snoozes its task for fifteen minutes', async () => {
  const { tasks, send, calls, requests } = await setup()
  const task = await tasks.create({ title: 'Học tiếng Trung', type: 'reminder', dueAt: '2026-01-01T22:00:00+07:00' })
  const before = Date.now()
  const result = await send('15 phút nữa nhắc lại')
  const saved = await tasks.find(task.id)
  expect(result.stderr).toContain(cliMessages.vi.tasks.overdue)
  expect(calls.map(call => call.name)).toEqual(['task_list', 'task_snooze'])
  expect(calls[1]!.input.id).toBe(task.id)
  expect(Date.parse(saved.snoozedUntil!)).toBeGreaterThanOrEqual(before + 900_000)
  expect(Date.parse(saved.snoozedUntil!)).toBeLessThanOrEqual(Date.now() + 900_000)
  expect(saved.dueAt).toBe(task.dueAt)
  expect(JSON.stringify(requests[0]!.messages)).toContain(task.id)
  expect(saved.delivery).toBeUndefined()
}, 20_000)

it('flow C: completes the task from the previous conversation turn', async () => {
  const { tasks, send, calls } = await setup()
  await send('10h tối nhắc tao học tiếng Trung')
  const task = (await tasks.list())[0]!
  await send('xong rồi')
  expect(calls.map(call => call.name)).toEqual(['task_create', 'task_list', 'task_complete'])
  expect(calls[2]!.input.id).toBe(task.id)
  expect((await tasks.find(task.id)).status).toBe('completed')
}, 20_000)

it('flow D: returns both matches and asks for clarification without editing either task', async () => {
  const { tasks, send, calls } = await setup()
  const first = await tasks.create({ title: 'Học tiếng Trung', type: 'reminder', dueAt: '2099-10-17T22:00:00+07:00' })
  const second = await tasks.create({ title: 'Ôn từ tiếng Trung', type: 'reminder', dueAt: first.dueAt })
  const result = await send('dời cái đó sang 9h')
  expect(result.stdout).toContain('Bạn muốn dời việc nào?')
  expect(calls.map(call => call.name)).toEqual(['task_list'])
  expect(await tasks.find(first.id)).toEqual(first)
  expect(await tasks.find(second.id)).toEqual(second)
}, 20_000)

it('flow E: kills a notifier between claim and text delivery, then recovers once through the real CLI', async () => {
  const { directory, tasks, send } = await setup()
  const due = '2026-01-01T10:00:00.000Z'
  const task = await tasks.create({ title: 'Interrupted study', type: 'routine', dueAt: due, recurrence: { type: 'daily' } })
  const fixture = join(directory, 'crash.mts')
  const path = (name: string) => JSON.stringify(fileURLToPath(new URL(`./${name}.ts`, import.meta.url)))
  await writeFile(fixture, `
import process from 'node:process'
import { Tasks } from ${path('tasks')}
import { ReminderScheduler } from ${path('reminder-scheduler')}
import { ReminderNotifications } from ${path('reminder-notifications')}
const notifications = new ReminderNotifications(${JSON.stringify(cliMessages.en.tasks)}, 'en', () => { throw new Error('Must remain paused') })
notifications.pause()
const scheduler = new ReminderScheduler(new Tasks(${JSON.stringify(directory)}, ${JSON.stringify(cliMessages.en.tasks)}, () => Date.parse(${JSON.stringify(due)})), {
  async notify(tasks, overdue, signal, verify) {
    process.send({ state: 'claimed' })
    await notifications.notify(tasks, overdue, signal, verify)
  },
}, error => { throw error })
await scheduler.start()
`)
  const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx')), fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  children.push(child)
  await once(child, 'message')
  const interrupted = await tasks.find(task.id)
  expect(interrupted.delivery?.status).toBe('claimed')
  expect(interrupted.lastNotifiedAt).toBeUndefined()
  expect(interrupted.dueAt).toBe(due)
  child.kill('SIGKILL')
  await once(child, 'close')
  const recovered = await send('Chào')
  expect(recovered.stderr).toContain('Interrupted study')
  const delivered = await tasks.find(task.id)
  expect(delivered.delivery?.status).toBe('delivered')
  expect(Date.parse(delivered.dueAt!)).toBeGreaterThan(Date.now())
  const again = await send('Chào lần nữa')
  expect(again.stderr).not.toContain('Interrupted study')
  const state = JSON.parse(await readFile(join(directory, 'tasks', 'tasks.json'), 'utf8'))
  expect(state.tasks[0].delivery.status).toBe('delivered')
}, 20_000)
