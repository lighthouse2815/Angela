import type { cliMessages } from '@angela/i18n/cli'
import type { GenerationProvider } from '@angela/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { getGenerationProvider, listProviders } from '@angela/provider-inference'

import * as v from 'valibot'

import { Chat } from './chat'
import { readConfig } from './config'
import { Memory } from './memory'
import { Recall } from './recall'
import { taskContext, taskTools } from './task-tools'
import { Tasks } from './tasks'

const cases = ['relative-time', 'ambiguous-task', 'memory', 'tool-selection'] as const

/** Runs real generation against disposable stores. Reports observed tool effects and fixed checks, never a model's own success claim. */
export class Evaluation {
  static readonly cases = cases

  constructor(private readonly provider: GenerationProvider, private readonly model: string, private readonly messages: typeof cliMessages.en) {}

  /** Each case has an independent directory and timeout. Cancellation stops subsequent cases and always removes synthetic data. */
  async run(selection: typeof cases[number] | 'all' = 'all', repeat = 1, timeoutMs = 45_000, signal = new AbortController().signal) {
    const results: { id: string, iteration: number, passed: boolean, checks: Record<string, boolean>, tools: string[], durationMs: number }[] = []
    for (let iteration = 1; iteration <= repeat; iteration++) {
      for (const id of cases.filter(id => selection === 'all' || selection === id)) {
        signal.throwIfAborted()
        const directory = await mkdtemp(join(tmpdir(), 'angela-eval-'))
        const started = performance.now()
        const tools: string[] = []
        let checks: Record<string, boolean>
        try {
          checks = await this.check(id, directory, tools, AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]))
        }
        catch {
          // Provider bodies and error objects can contain credentials. Reports expose only bounded fixture outcomes.
          checks = { generation_completed: false }
        }
        finally {
          await rm(directory, { recursive: true, force: true })
        }
        signal.throwIfAborted()
        results.push({ id, iteration, passed: Object.values(checks).every(Boolean), checks, tools, durationMs: Math.round(performance.now() - started) })
      }
    }
    return { model: this.model, passed: results.length > 0 && results.every(result => result.passed), results }
  }

  private async request(text: string, tools: Tool[], context: string, directory: string, calls: string[], signal: AbortSignal) {
    let answer = ''
    await new Chat(this.model, this.provider, directory).send(text, {
      tools,
      abortSignal: signal,
      diagnostics: { error() {}, warn() {} },
      onStreamEvent(event) {
        if (event.type === 'tool-call')
          calls.push(event.toolName)
        if (event.type === 'text-delta')
          answer += event.text
      },
    }, context)
    return answer
  }

  private async check(id: typeof cases[number], directory: string, calls: string[], signal: AbortSignal): Promise<Record<string, boolean>> {
    const now = Date.now()
    const tasks = new Tasks(directory, this.messages.tasks, () => now, 'Asia/Ho_Chi_Minh')
    if (id === 'relative-time') {
      const text = '20 phút nữa nhắc tôi học tiếng Trung.'
      await this.request(text, taskTools(tasks, this.messages.tasks, undefined, text), taskContext(tasks), directory, calls, signal)
      const saved = await tasks.list()
      return {
        used_task_create: calls.includes('task_create'),
        saved_one_reminder: saved.length === 1 && saved[0]?.type === 'reminder',
        correct_relative_time: saved.length === 1 && Math.abs(Date.parse(saved[0]?.dueAt ?? '') - now - 20 * 60_000) <= 60_000,
        correct_timezone: saved[0]?.timezone === 'Asia/Ho_Chi_Minh',
      }
    }
    if (id === 'ambiguous-task') {
      await tasks.create({ title: 'Học tiếng Trung', type: 'todo', dueDate: '2027-01-01' })
      await tasks.create({ title: 'Học tiếng Trung', type: 'todo', dueDate: '2027-01-02' })
      const answer = await this.request('Đánh dấu xong việc học tiếng Trung giúp tôi.', taskTools(tasks, this.messages.tasks), taskContext(tasks), directory, calls, signal)
      return {
        inspected_tasks: calls.includes('task_list'),
        preserved_both_tasks: (await tasks.list()).length === 2,
        avoided_ambiguous_write: !calls.some(name => ['task_complete', 'task_update', 'task_cancel'].includes(name)),
        asked_for_selection: /\?|nào|chọn|which/iu.test(answer),
      }
    }
    if (id === 'memory') {
      const memory = new Memory(directory, this.messages)
      const text = 'Tôi tên là Mai. Hãy nhớ tên tôi cho lần sau.'
      await this.request(text, await memory.tools(text, randomUUID()), '', directory, calls, signal)
      const saved = await new Memory(directory, this.messages).read()
      const recall = new Recall(directory, directory, randomUUID(), this.messages, {}, { apiKey: '' })
      let answer = ''
      try {
        await recall.start()
        const question = 'Tên tôi là gì?'
        const prepared = await recall.prepare(question, signal)
        answer = await this.request(question, recall.tools(), prepared.context, directory, calls, signal)
      }
      finally {
        await recall.close()
      }
      return {
        used_personal_memory: calls.includes('personal_memory'),
        persisted_name: saved.entries.some(entry => entry.text.includes('Mai')),
        recalled_in_fresh_conversation: /\bMai\b/u.test(answer),
      }
    }
    const code = `study-${randomUUID()}`
    const path = join(directory, 'study-note.txt')
    await writeFile(path, `Mã ôn tập: ${code}`, { mode: 0o600 })
    const note: Tool = {
      type: 'function',
      function: {
        name: 'read_study_note',
        description: 'Read the current study note, including its revision code.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
      execute: async (_input, options) => await readFile(path, { encoding: 'utf8', signal: options.abortSignal }),
    }
    const answer = await this.request('Đọc ghi chú học tập hiện tại và cho tôi biết chính xác mã ôn tập trong đó.', [note, ...taskTools(tasks, this.messages.tasks)], 'Read the note with its tool before answering. Never invent its code.', directory, calls, signal)
    return {
      selected_note_tool: calls.includes('read_study_note'),
      returned_observed_code: answer.includes(code),
      left_tasks_unchanged: (await tasks.list({ status: 'all' })).length === 0,
    }
  }
}

/**
 * Evaluates the selected real provider without connecting MCP or accessing the user's saved data.
 *
 * Call stack:
 * runEvaluation -> readConfig -> Evaluation.run -> Chat.send -> provider
 *                                              -> disposable Tasks, Memory and Recall
 */
export async function runEvaluation(args: string[], env: NodeJS.ProcessEnv) {
  const { values } = parseArgs({ args, options: {
    'case': { type: 'string' },
    'repeat': { type: 'string' },
    'timeout-ms': { type: 'string' },
    'json': { type: 'boolean' },
    'model': { type: 'string' },
    'provider': { type: 'string' },
    'config': { type: 'string' },
    'base-url': { type: 'string' },
    'api': { type: 'string' },
    'locale': { type: 'string' },
    'help': { type: 'boolean', short: 'h' },
  } })
  const { messages } = await readConfig(['--help', ...(values.locale ? ['--locale', values.locale] : [])], env)
  if (values.help) {
    process.stdout.write(`${messages.evaluation.usage}\n${messages.evaluation.scope}\n`)
    return
  }
  const selection = v.parse(v.picklist([...cases, 'all'], messages.evaluation.usage), values.case ?? 'all')
  const repeat = Number(values.repeat ?? 1)
  const timeoutMs = Number(values['timeout-ms'] ?? 45_000)
  if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 5 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300_000)
    throw new Error(messages.evaluation.usage)
  const configArgs = (['model', 'provider', 'config', 'base-url', 'api', 'locale'] as const).flatMap(key => values[key] === undefined ? [] : [`--${key}`, values[key]!])
  const config = await readConfig(configArgs, env)
  if (config.help || config.list)
    throw new Error(messages.evaluation.usage)
  const definition = listProviders().find(provider => provider.id === config.definitionId)
  const provider = definition && getGenerationProvider(await definition.createProvider(config.providerConfig))
  if (!provider)
    throw new Error(messages.unsupportedProvider)
  const shutdown = new AbortController()
  const interrupt = () => {
    process.exitCode = 130
    shutdown.abort()
  }
  const terminate = () => {
    process.exitCode = 143
    shutdown.abort()
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  // Deadline timers do not retain the process. This host stays alive until a report is printed or the user cancels.
  const keepAlive = setInterval(() => {}, 60_000)
  try {
    const report = await new Evaluation(provider, config.model, messages).run(selection, repeat, timeoutMs, shutdown.signal)
    process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${messages.evaluation.scope}\n${report.results.map(result => `${result.passed ? 'PASS' : 'FAIL'} ${result.id} #${result.iteration} (${result.durationMs}ms) ${Object.entries(result.checks).filter(([, passed]) => !passed).map(([name]) => name).join(', ')}`).join('\n')}\n`)
    if (!report.passed)
      process.exitCode = 1
  }
  catch {
    if (!shutdown.signal.aborted)
      throw new Error(messages.evaluation.failed)
  }
  finally {
    clearInterval(keepAlive)
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}
