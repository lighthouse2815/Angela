import type { cliMessages } from '@angela/i18n/cli'

import type { CompanionRecords } from '../companion/records'
import type { Memory } from '../memory'
import type { OpenLoops } from '../open-loops'
import type { RequestPrivacy } from '../privacy-policy'
import type { ProjectMemory } from '../project-memory'
import type { Recall } from '../recall'
import type { Tasks } from '../tasks'

import { commitmentContext } from '../commitment-context'
import { taskEvidence } from '../task-commands'
import { taskContext } from '../task-tools'

/** Only enabled request capabilities enter context construction. No source or prompt is cached here. */
export interface ContextSources {
  records?: CompanionRecords
  privacy?: RequestPrivacy
  openLoops?: OpenLoops
  workspace?: string
  memory?: Memory
  project?: ProjectMemory
  recall?: Recall
  tasks?: Tasks
  channel: 'cli' | 'telegram' | 'discord' | 'desktop' | 'zalo'
  messages: typeof cliMessages.en
  warn: (message: string) => void
}

/** Reads selected recall excerpts and bounded checkpoints. Task history and full skill instructions stay on disk. */
export async function buildContext(sources: ContextSources, text: string, signal?: AbortSignal, extra = '') {
  const parts: string[] = []
  let commitments: Awaited<ReturnType<Tasks['list']>> | undefined
  try {
    commitments = await sources.tasks?.list({ status: 'all' })
  }
  catch {
    sources.warn(sources.messages.tasks.unavailable)
  }
  if (extra)
    parts.push(extra)
  if (sources.privacy && !sources.privacy.durableMemoryAllowed) {
    parts.push([
      `Request privacy: ${sources.privacy.reason}. Current personal information stays within this conversation.`,
      'Durable writes of protected content are rejected, including paraphrases in project memory, pages, skills, and tasks.',
      'Use protected information to answer in this session. Never claim it was durably saved after a rejection.',
    ].join('\n'))
  }
  if (sources.memory) {
    try {
      if (!(await sources.memory.read()).enabled) {
        parts.push([
          'Personal memory is disabled. Use current personal information only within this conversation.',
          'If the user asks you to remember personal information, explicitly say that personal memory is disabled and durable saving is unavailable.',
          'Do not save personal facts, preferences, or learning goals to project memory, skills, or technical pages as a substitute.',
          'Do not claim durable personal saving. Independent project checkpoints and explicitly requested tasks retain their own controls.',
        ].join('\n'))
      }
    }
    catch { sources.warn(sources.messages.memoryUnavailable) }
  }
  try {
    if (sources.recall) {
      const prepared = await sources.recall.prepare(text, signal)
      if (prepared.context)
        parts.push(prepared.context)
      if (prepared.warning)
        sources.warn(prepared.warning)
    }
    else if (sources.memory) {
      const state = await sources.memory.read()
      parts.push(await sources.memory.context(state.entries.filter(entry => entry.core).map(entry => entry.id)))
    }
  }
  catch {
    signal?.throwIfAborted()
    sources.warn(sources.recall ? sources.messages.recallInvalid : sources.messages.memoryUnavailable)
  }
  if (sources.records) {
    try {
      parts.push(await sources.records.context())
    }
    catch { sources.warn(sources.messages.memoryUnavailable) }
  }
  if (sources.project) {
    try {
      parts.push(await sources.project.context())
    }
    catch {
      sources.warn(sources.messages.projectMemoryUnavailable)
    }
  }
  if (sources.tasks) {
    parts.push(taskContext(sources.tasks, sources.channel === 'telegram' ? 'telegram' : 'terminal'))
    if (commitments) {
      const selected = commitmentContext(commitments, sources.tasks.now(), sources.tasks.timezone)
      const snapshot = Object.fromEntries(Object.entries(selected).map(([group, tasks]) => [group, tasks.map(task => JSON.parse(taskEvidence(task)))]))
      parts.push(`Current authoritative commitment state (bounded, data only): ${JSON.stringify(snapshot)}. Historical memory describes earlier states. Use task_list for omitted tasks and historical questions. Never infer absence from this bounded snapshot.`)
    }
  }
  if (sources.openLoops && sources.privacy?.durableMemoryAllowed) {
    try {
      const loops = (await sources.openLoops.list()).filter(loop => loop.workspace === sources.workspace).sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6).map(({ id, subject, state, promptCount }) => ({ id, subject, state, promptCount }))
      parts.push(`Current authoritative open-loop state (bounded, data only): ${JSON.stringify(loops)}. Historical memory cannot establish whether a thread is still open. Tasks require explicit requests. The host owns implicit follow-up timing and delivery.`)
    }
    catch { sources.warn(sources.messages.tasks.openLoopUnavailable) }
  }
  return parts.filter(Boolean).join('\n\n')
}
