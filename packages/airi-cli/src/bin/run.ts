#!/usr/bin/env node

import process from 'node:process'

import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { errorMessageFrom } from '@moeru/std'
import { getGenerationProvider, listProviders } from '@proj-airi/provider-inference'

import { Chat } from '../chat'
import { readConfig } from '../config'
import { McpTools } from '../mcp'
import { Sessions } from '../sessions'
import { Terminal } from '../terminal'

/**
 * Runs terminal chat and owns input, signals, and provider configuration.
 *
 * Call stack:
 * main -> readConfig -> Chat.send -> core-agent.streamFrom
 *                    -> McpTools -> MCP client -> tool server
 */
async function main() {
  const config = await readConfig(process.argv.slice(2), process.env)
  const messages = config.messages
  if (config.help) {
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\n\n${[
      ['--model', messages.model],
      ['--provider', messages.provider],
      ['--config', messages.configFile],
      ['--base-url', messages.baseUrl],
      ['--api', messages.protocol],
      ['--prompt, -p', messages.prompt],
      ['--cwd', messages.cwd],
      ['--locale', messages.locale],
      ['--help, -h', messages.help],
      ['--computer-use', messages.computerUse],
      ['--mcp-command', messages.mcpCommand],
      ['--mcp-arg', messages.mcpArg],
      ['--resume', messages.resume],
      ['--list-sessions', messages.listSessions],
      ['--data-dir', messages.dataDir],
    ].map(([flag, text]) => `  ${flag.padEnd(16)}${text}`).join('\n')}\n`)
    return
  }

  const sessions = new Sessions(config.dataDir, messages)
  if (config.list) {
    const list = await sessions.list()
    process.stdout.write(list.length ? `${list.map(session => JSON.stringify(session)).join('\n')}\n` : `${messages.noSessions}\n`)
    return
  }
  // An explicit workspace wins. Resumed sessions otherwise retain their recorded workspace.
  const previous = config.resume ? await sessions.read(config.resume) : undefined
  const workspace = await realpath(config.cwd ?? previous?.workspace ?? process.cwd())
  if (!(await stat(workspace)).isDirectory())
    throw new Error(messages.invalidWorkspace)
  const session = await sessions.open(workspace, config.resume)
  try {
    const definition = listProviders().find(provider => provider.id === config.definitionId)
    if (!definition)
      throw new Error(`${messages.unsupportedProvider}: ${config.definitionId}`)
    const provider = getGenerationProvider(await definition.createProvider(config.providerConfig))
    if (!provider)
      throw new Error(`${messages.unsupportedProvider}: ${config.definitionId}`)
    const chat = new Chat(config.model, provider, workspace, session.restore())
    await session.save(chat.conversation, session.record.interrupted)
    process.stderr.write(`${messages.session}: ${session.record.id}\n`)
    if (session.record.interrupted)
      process.stderr.write(`${messages.incompleteSession}\n`)
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
      let completed = false
      try {
        await session.save(chat.conversation, true)
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
        completed = true
        process.stdout.write('\n')
      }
      catch (error) {
        process.stderr.write(`\n${active.signal.aborted ? messages.interrupted : `${messages.failed}: ${errorMessageFrom(error) ?? String(error)}`}\n`)
        if (!interactive && process.exitCode !== 143)
          process.exitCode = active.signal.aborted ? 130 : 1
      }
      finally {
        active = undefined
        await session.save(chat.conversation, !completed)
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
        if (config.computerUse && !childEnv.COMPUTER_USE_SESSION_ROOT)
          childEnv.COMPUTER_USE_SESSION_ROOT = join(config.dataDir, 'computer-use', session.record.id)
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
  finally {
    await session.close()
  }
}

void main().catch((error) => {
  process.stderr.write(`${errorMessageFrom(error) ?? String(error)}\n`)
  process.exitCode = 1
})
