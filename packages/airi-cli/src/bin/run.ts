#!/usr/bin/env node

import process from 'node:process'

import { realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { errorMessageFrom } from '@moeru/std'
import { getDefinedProvider, getGenerationProvider } from '@proj-airi/provider-inference'

import { Chat } from '../chat'
import { readConfig } from '../config'
import { McpTools } from '../mcp'
import { Terminal } from '../terminal'

/**
 * Runs terminal chat and owns input, signals, and provider configuration.
 *
 * Call stack:
 * main -> readConfig -> Chat.send -> core-agent.streamFrom
 *                    -> McpTools -> MCP client -> tool server
 */
async function main() {
  const config = readConfig(process.argv.slice(2), process.env)
  const messages = config.messages
  if (config.help) {
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\n\n${[
      ['--model', messages.model],
      ['--base-url', messages.baseUrl],
      ['--api', messages.protocol],
      ['--prompt, -p', messages.prompt],
      ['--cwd', messages.cwd],
      ['--locale', messages.locale],
      ['--help, -h', messages.help],
      ['--computer-use', messages.computerUse],
      ['--mcp-command', messages.mcpCommand],
      ['--mcp-arg', messages.mcpArg],
    ].map(([flag, text]) => `  ${flag.padEnd(16)}${text}`).join('\n')}\n`)
    return
  }

  const workspace = await realpath(config.cwd ?? process.cwd())
  const definition = getDefinedProvider('openai-compatible')!
  const provider = getGenerationProvider(await definition.createProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, api: config.api }))!
  const chat = new Chat(config.model, provider, workspace)
  const interactive = process.stdin.isTTY && config.prompt === undefined
  let input: Terminal | undefined
  let active: AbortController | undefined
  const shutdown = new AbortController()
  const interrupt = () => {
    if (active) {
      active.abort()
    }
    else {
      input?.close()
      shutdown.abort()
    }
  }
  process.on('SIGINT', interrupt)
  if (process.stdin.isTTY)
    input = new Terminal(interrupt)
  const stop = () => {
    active?.abort()
    shutdown.abort()
    input?.close()
    process.exitCode = 143
  }
  process.on('SIGTERM', stop)
  let client: Client | undefined
  let mcp: McpTools | undefined

  async function send(text: string) {
    active = new AbortController()
    try {
      await chat.send(text, {
        abortSignal: active.signal,
        tools: mcp?.definitions(),
        onStreamEvent(event) {
          if (event.type === 'text-delta')
            process.stdout.write(event.text)
          if (event.type === 'error')
            throw event.error
          if (event.type === 'tool-call')
            process.stderr.write(`\n${messages.tool}: ${event.toolName}\n`)
          if (event.type === 'tool-result' || event.type === 'tool-error')
            process.stderr.write(`${JSON.stringify(event)}\n`)
        },
      })
      process.stdout.write('\n')
    }
    catch (error) {
      process.stderr.write(`\n${active.signal.aborted ? messages.interrupted : `${messages.failed}: ${errorMessageFrom(error) ?? String(error)}`}\n`)
      if (!interactive && process.exitCode !== 143)
        process.exitCode = active.signal.aborted ? 130 : 1
    }
    finally {
      active = undefined
    }
  }

  try {
    if (config.computerUse || config.mcpCommand) {
      client = new Client({ name: '@proj-airi/airi-cli', version: '0.12.0-beta.5' })
      const childEnv: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && key !== 'ANGELA_API_KEY')
          childEnv[key] = value
      }
      const transport = new StdioClientTransport({
        command: config.computerUse ? process.execPath : config.mcpCommand!,
        args: config.computerUse
          ? [fileURLToPath(new URL('./bin/run.mjs', import.meta.resolve('@proj-airi/computer-use-mcp')))]
          : config.mcpArgs,
        cwd: workspace,
        env: childEnv,
        stderr: 'inherit',
      })
      await client.connect(transport, { signal: shutdown.signal })
      mcp = new McpTools(client, async (request, signal) => {
        process.stderr.write(`\n${messages.tool}: ${request.name}\n${JSON.stringify(request.arguments, null, 2)}\n`)
        if (!input)
          return false
        return (await input.ask(`${messages.approve} `, signal))?.trim().toLowerCase() === 'yes'
      }, messages, config.computerUse ? workspace : undefined)
      await mcp.discover(shutdown.signal)
      process.stderr.write(`${messages.mcpConnected}\n`)
    }
    if (input && interactive) {
      process.stderr.write(`${messages.workspace}: ${workspace}\n${messages.welcome}\n`)
      while (true) {
        const text = (await input.ask('> '))?.trim()
        if (text === undefined || text === '/exit')
          break
        if (text)
          await send(text)
      }
    }
    else {
      let text = config.prompt ?? ''
      if (config.prompt === undefined) {
        process.stdin.setEncoding('utf8')
        for await (const chunk of process.stdin)
          text += chunk
      }
      if (!text.trim())
        throw new Error(messages.emptyInput)
      await send(text)
    }
  }
  finally {
    input?.close()
    await client?.close()
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', stop)
  }
}

void main().catch((error) => {
  process.stderr.write(`${errorMessageFrom(error) ?? String(error)}\n`)
  process.exitCode = 1
})
