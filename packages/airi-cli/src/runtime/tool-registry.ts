import type { StreamEvent } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import type { McpTools } from '../mcp'
import type { ContextSources } from './context-builder'

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

import { taskTools } from '../task-tools'

/** Builds one request's executable definitions and evidence. No connection or discovery occurs while listing tools. */
export async function buildTools(sources: ContextSources, text: string, sessionId: string, mcp?: McpTools) {
  const observations: string[] = []
  const verified: string[] = []
  const calls = new Set<string>()
  const tools: Tool[] = []
  if (mcp)
    tools.push(...mcp.definitions())
  if (sources.memory) {
    try {
      tools.push(...await sources.memory.tools(text, sessionId))
    }
    catch { sources.warn(sources.messages.memoryUnavailable) }
  }
  if (sources.project) {
    try {
      tools.push(...await sources.project.tools(text, sessionId, observations))
    }
    catch { sources.warn(sources.messages.projectMemoryUnavailable) }
  }
  if (sources.tasks)
    tools.push(...taskTools(sources.tasks, sources.messages.tasks))
  const recall = sources.recall
  if (recall)
    tools.push(...recall.tools(), ...recall.skills.tools(text, verified, sessionId, () => recall.changed(false)))
  return {
    tools,
    observe(event: StreamEvent) {
      if (event.type === 'tool-call' && event.toolName === 'builtIn_mcpCallTool') {
        if (calls.size >= 64)
          calls.delete(calls.values().next().value!)
        calls.add(event.toolCallId)
      }
      if ((event.type !== 'tool-result' && event.type !== 'tool-error') || !calls.delete(event.toolCallId) || !event.result)
        return
      const observation = typeof event.result === 'string' ? event.result : JSON.stringify(event.result)
      const excerpt = observation.slice(0, 20_000)
      observations.push(excerpt)
      if (observations.length > 8)
        observations.shift()
      if (event.type === 'tool-result') {
        try {
          const result = CallToolResultSchema.safeParse(typeof event.result === 'string' ? JSON.parse(event.result) : event.result)
          const backend = result.success ? result.data.structuredContent?.backendResult : undefined
          const failed = backend && typeof backend === 'object' && (('timedOut' in backend && backend.timedOut) || ('exitCode' in backend && backend.exitCode !== undefined && backend.exitCode !== null && backend.exitCode !== 0))
          if (result.success && !result.data.isError && !failed) {
            verified.push(excerpt)
            if (verified.length > 8)
              verified.shift()
          }
        }
        catch { /* Unrecognized payloads cannot establish verification evidence. */ }
      }
    },
    close() {
      observations.length = 0
      verified.length = 0
      calls.clear()
      tools.length = 0
    },
  }
}
