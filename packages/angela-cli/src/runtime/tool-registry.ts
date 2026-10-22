import type { StreamEvent } from '@angela/core-agent'
import type { Tool } from '@xsai/shared-chat'

import type { McpTools } from '../mcp'
import type { ContextSources } from './context-builder'
import type { EventPayload } from './events'

import * as v from 'valibot'

import { sanitize } from '../memory-v2/sanitize'
import { durableWriteRejection, requestPrivacy } from '../privacy-policy'
import { taskEvidence } from '../task-commands'
import { taskSchema } from '../task-schema'
import { taskTools } from '../task-tools'

/** Host-verified evidence is separate from raw SDK completion. Result text is bounded before memory capture. */
export interface ToolObservation {
  toolName: string
  text: string
  outcome: 'verified' | 'unverified' | 'failed'
  domain?: EventPayload
}

/** Builds request-local tools and verification evidence. Tool implementations retain their existing policy and storage owners. */
export async function buildTools(sources: ContextSources, text: string, sessionId: string, mcp?: McpTools) {
  const privacy = sources.privacy ?? requestPrivacy(text, sources.memory ? (await sources.memory.read()).enabled : true)
  const observations: string[] = []
  const verified: string[] = []
  const calls = new Map<string, string>()
  const resultSchema = mcp ? (await import('@modelcontextprotocol/sdk/types.js')).CallToolResultSchema : undefined
  const tools: Tool[] = []
  if (mcp) {
    tools.push(...mcp.definitions().map(tool => tool.function.name === 'builtIn_mcpCallTool' && !privacy.durableMemoryAllowed && !privacy.projectWritesAllowed
      ? { ...tool, execute: async () => ({ status: 'rejected', reason: privacy.reason }) }
      : tool))
  }
  if (sources.memory) {
    try {
      tools.push(...await sources.memory.tools(text, sessionId, privacy))
    }
    catch { sources.warn(sources.messages.memoryUnavailable) }
  }
  if (sources.project) {
    try {
      tools.push(...await sources.project.tools(text, sessionId, observations, privacy))
    }
    catch { sources.warn(sources.messages.projectMemoryUnavailable) }
  }
  if (sources.tasks)
    tools.push(...taskTools(sources.tasks, sources.messages.tasks, privacy))
  const recall = sources.recall
  if (recall) {
    tools.push(...recall.tools())
    try {
      tools.push(...await recall.pageTools(text, verified, privacy))
    }
    catch { sources.warn(sources.messages.memoryUnavailable) }
    tools.push(...recall.skills.tools(text, verified, sessionId, () => recall.changed(false), privacy))
  }
  const domains = new Map<string, 'personal' | 'project' | 'task' | 'workflow'>([
    ['personal_memory', 'personal'],
    ['project_memory', 'project'],
    ['memory_page_save', 'workflow'],
    ['skill_save', 'workflow'],
    ['task_create', 'task'],
    ['task_update', 'task'],
    ['task_complete', 'task'],
    ['task_cancel', 'task'],
    ['task_snooze', 'task'],
  ])
  for (const tool of tools) {
    const domain = domains.get(tool.function.name)
    const execute = tool.execute
    if (!domain || !execute || !sources.memory)
      continue
    tool.execute = async (input, options) => {
      // A different channel can disable personal memory after tools enter the model request.
      const current = requestPrivacy(text, (await sources.memory!.read()).enabled, privacy)
      const forgetting = domain === 'personal' && input && typeof input === 'object' && 'action' in input && input.action === 'forget'
      const rejection = forgetting ? undefined : durableWriteRejection(current, domain, input)
      if (rejection)
        return rejection
      if (tool.function.name === 'task_create' && (!/nhắc|(?:tạo|thêm|lưu)\s+(?:việc|lịch|tác vụ)|\b(?:remind|schedule|add|create|save)\b/iu.test(text)
        || /(?:^|[\s,:;.!?])(?:chắc|có lẽ|nếu|ví dụ|đừng|không cần|maybe|perhaps|do not|don't)(?:$|[\s,:;.!?])|["“”]/iu.test(text))) {
        return { status: 'rejected', reason: sources.messages.tasks.clarifyTime }
      }
      return await execute(input, options)
    }
  }
  return {
    tools,
    observe(event: StreamEvent): ToolObservation | undefined {
      if (event.type === 'tool-call') {
        if (calls.size >= 64)
          calls.delete(calls.keys().next().value!)
        calls.set(event.toolCallId, event.toolName)
        return undefined
      }
      if (event.type !== 'tool-result' && event.type !== 'tool-error')
        return undefined
      const toolName = calls.get(event.toolCallId)
      calls.delete(event.toolCallId)
      if (!toolName)
        return undefined
      const evidence: ToolObservation = { toolName, text: toolName, outcome: event.type === 'tool-error' ? 'failed' : 'unverified' }
      if (event.type === 'tool-error')
        return evidence
      try {
        // Unbounded serialization can duplicate an entire tool payload. Only text blocks and small status fields enter capture.
        const result: unknown = typeof event.result === 'string' && event.result.length <= 100_000 ? JSON.parse(event.result) : event.result
        if (toolName === 'builtIn_mcpCallTool' && resultSchema) {
          const parsed = resultSchema.safeParse(result)
          if (parsed.success) {
            const backend = parsed.data.structuredContent?.backendResult
            const failed = parsed.data.isError || (backend && typeof backend === 'object' && (('timedOut' in backend && backend.timedOut) || ('exitCode' in backend && backend.exitCode !== undefined && backend.exitCode !== null && backend.exitCode !== 0)))
            evidence.outcome = failed ? 'failed' : 'verified'
            const excerpts: string[] = []
            let remaining = 16_000
            for (const block of parsed.data.content) {
              if (block.type === 'text' && remaining > 0) {
                const excerpt = sanitize(block.text, remaining)
                excerpts.push(excerpt)
                remaining -= excerpt.length
              }
            }
            const excerpt = sanitize(excerpts.join('\n'), 16_000)
            observations.push(excerpt)
            if (observations.length > 8)
              observations.shift()
            if (evidence.outcome === 'verified') {
              verified.push(excerpt)
              if (verified.length > 8)
                verified.shift()
            }
            evidence.text = `${toolName}: ${sanitize(excerpt, 3000)}`
          }
        }
        else if (result && typeof result === 'object' && 'status' in result) {
          if (result.status === 'rejected' || result.status === 'unavailable')
            evidence.outcome = 'failed'
          if (result.status === 'saved' || result.status === 'deleted') {
            evidence.outcome = 'verified'
            if (toolName.startsWith('task_') && 'result' in result && result.result && typeof result.result === 'object' && 'id' in result.result && typeof result.result.id === 'string') {
              const task = result.result
              const id = String(task.id)
              evidence.domain = { type: toolName === 'task_create' ? 'task.created' : toolName === 'task_complete' ? 'task.completed' : 'task.updated', taskId: id }
              evidence.text = taskEvidence(v.parse(taskSchema, task))
            }
            else if (toolName === 'project_memory' && 'revision' in result && typeof result.revision === 'number') {
              evidence.domain = { type: 'project.changed', revision: result.revision }
              if ('snapshot' in result)
                evidence.text = `Project checkpoint: ${sanitize(JSON.stringify(result.snapshot), 3000)}`
            }
            else if ((toolName === 'personal_memory' || toolName === 'memory_page_save') && 'id' in result && typeof result.id === 'string') {
              evidence.domain = { type: 'memory.changed', memoryId: result.id, action: result.status === 'deleted' ? 'deleted' : 'saved' }
            }
          }
        }
      }
      catch { /* Unrecognized payloads cannot establish verification evidence. */ }
      return evidence
    },
    close() {
      observations.length = 0
      verified.length = 0
      calls.clear()
      tools.length = 0
    },
  }
}
