import type { CallToolResult, Tool as McpTool } from '@modelcontextprotocol/sdk/types.js'
import type { cliMessages } from '@proj-airi/i18n/cli'
import type { Tool } from '@xsai/shared-chat'

import process from 'node:process'

import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

import * as v from 'valibot'

type Confirm = (request: { name: string, arguments: Record<string, unknown> }, signal?: AbortSignal) => Promise<boolean>

const reserved = new Set(['desktop_approve_pending_action', 'desktop_reject_pending_action'])
const terminalTools = new Set(['terminal_exec', 'terminal_get_state', 'pty_create', 'pty_read', 'pty_send_input', 'pty_write', 'pty_resize', 'pty_close'])
const callSchema = v.object({ name: v.string(), arguments: v.string() })
const argumentsSchema = v.record(v.string(), v.unknown())

/** Owns tool discovery and host approval. Model calls cannot approve another model call. */
export class McpTools {
  private discovered: McpTool[] = []
  private readonly names = new Set<string>()
  private approvalQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly client: Client,
    private readonly confirm: Confirm,
    private readonly messages: typeof cliMessages.en,
    private readonly workspace?: string,
  ) {}

  /** Connects one host session. The caller closes it after all active calls finish. */
  static async connect(
    config: { computerUse: boolean, mcpCommand?: string, mcpArgs: string[] },
    workspace: string,
    sessionRoot: string,
    confirm: Confirm,
    messages: typeof cliMessages.en,
    env: NodeJS.ProcessEnv,
    signal?: AbortSignal,
  ) {
    const client = new Client({ name: '@proj-airi/airi-cli', version: '0.12.0-beta.5' })
    const childEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined && !['ANGELA_API_KEY', 'ANGELA_TELEGRAM_BOT_TOKEN'].includes(key))
        childEnv[key] = value
    }
    if (config.computerUse && !childEnv.COMPUTER_USE_SESSION_ROOT)
      childEnv.COMPUTER_USE_SESSION_ROOT = sessionRoot
    const tools = new McpTools(client, confirm, messages, config.computerUse ? workspace : undefined)
    try {
      await client.connect(new StdioClientTransport({
        command: config.computerUse ? process.execPath : config.mcpCommand!,
        args: config.computerUse
          ? [fileURLToPath(new URL('./bin/run.mjs', import.meta.resolve('@proj-airi/computer-use-mcp')))]
          : config.mcpArgs,
        cwd: workspace,
        env: childEnv,
        stderr: 'inherit',
      }), { signal })
      await tools.discover(signal)
      return tools
    }
    catch (error) {
      await client.close()
      throw error
    }
  }

  async close() {
    try {
      await this.client.close()
    }
    finally {
      this.discovered.length = 0
      this.names.clear()
      this.approvalQueue = Promise.resolve()
    }
  }

  /** Reads every discovery page. Built-in mode exposes terminal operations only. */
  async discover(signal?: AbortSignal) {
    this.discovered.length = 0
    this.names.clear()
    let schemaChars = 0
    let cursor: string | undefined
    const cursors = new Set<string>()
    do {
      const page = await this.client.listTools({ cursor }, { signal })
      for (const tool of page.tools) {
        if (reserved.has(tool.name) || (this.workspace && !terminalTools.has(tool.name)))
          continue
        schemaChars += JSON.stringify(tool).length
        if (this.discovered.length >= 512 || schemaChars > 2_000_000)
          throw new Error('MCP discovery limit exceeded')
        this.discovered.push(tool)
      }
      cursor = page.nextCursor
      if (cursors.size >= 64)
        throw new Error('MCP discovery page limit exceeded')
      if (cursor && cursors.has(cursor))
        throw new Error('MCP discovery returned a repeated cursor')
      if (cursor)
        cursors.add(cursor)
    } while (cursor)
    for (const tool of this.discovered)
      this.names.add(tool.name)
  }

  /** Uses the existing AIRI discovery/call pattern to keep tool schemas out of every model request. */
  definitions(): Tool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'builtIn_mcpListTools',
          description: 'List available MCP tools and their input schemas before calling builtIn_mcpCallTool.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
        execute: () => this.discovered,
      },
      {
        type: 'function',
        function: {
          name: 'builtIn_mcpCallTool',
          description: 'Call a discovered MCP tool. arguments contains a JSON object. The CLI applies the user-selected approval mode.',
          parameters: {
            type: 'object',
            properties: { name: { type: 'string' }, arguments: { type: 'string' } },
            required: ['name', 'arguments'],
            additionalProperties: false,
          },
        },
        execute: async (input, options) => {
          const call = v.parse(callSchema, input)
          return await this.call(call.name, v.parse(argumentsSchema, JSON.parse(call.arguments)), options.abortSignal)
        },
      },
    ]
  }

  /** A positive confirmation authorizes this exact invocation. Pending server actions need their own confirmation. */
  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult> {
    signal?.throwIfAborted()
    if (reserved.has(name))
      return this.denied(this.messages.approvalReserved)
    if (!this.names.has(name))
      return this.denied(this.messages.unknownTool)
    const request = {
      name,
      arguments: this.workspace && (name === 'terminal_exec' || name === 'pty_create')
        ? { cwd: this.workspace, ...args }
        : args,
    }
    if (!await this.confirmRequest(request, signal))
      return this.denied(this.messages.approvalDenied)
    signal?.throwIfAborted()
    const result = await this.invoke(request, signal)
    if (result.structuredContent?.status !== 'approval_required')
      return result
    const id = v.parse(v.string(), result.structuredContent.pendingActionId)
    const approved = await this.confirmRequest({ name: 'desktop_approve_pending_action', arguments: { id, pending: result.structuredContent } }, signal)
    signal?.throwIfAborted()
    const outcome = await this.invoke({ name: approved ? 'desktop_approve_pending_action' : 'desktop_reject_pending_action', arguments: { id } }, signal)
    return approved ? outcome : this.denied(this.messages.approvalDenied)
  }

  private denied(text: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text }] }
  }

  private async confirmRequest(request: { name: string, arguments: Record<string, unknown> }, signal?: AbortSignal) {
    // Parallel model tool calls share one reader. Each question waits for the previous answer.
    const pending = this.approvalQueue.then(() => {
      signal?.throwIfAborted()
      return this.confirm(request, signal)
    })
    this.approvalQueue = pending.then(() => {}, () => {})
    return await pending
  }

  private async invoke(request: { name: string, arguments: Record<string, unknown> }, signal?: AbortSignal): Promise<CallToolResult> {
    // The SDK validates content blocks and keeps server errors separate from transport failures.
    return CallToolResultSchema.parse(await this.client.callTool(request, CallToolResultSchema, { signal, timeout: 120_000 }))
  }
}
