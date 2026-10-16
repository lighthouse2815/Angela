#!/usr/bin/env node

import process from 'node:process'

import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { getGenerationProvider, listProviders } from '@proj-airi/provider-inference'

import { Chat } from '../chat'
import { readConfig } from '../config'
import { formatRequestError } from '../errors'
import { McpTools } from '../mcp'
import { Output } from '../output'
import { Permissions } from '../permissions'
import { Sessions } from '../sessions'
import { runTelegram } from '../telegram'
import { Terminal } from '../terminal'
import { Voice } from '../voice'

/**
 * Runs terminal chat and owns input, signals, and provider configuration.
 *
 * Call stack:
 * main -> readConfig -> Chat.send -> core-agent.streamFrom
 *                    -> McpTools -> MCP client -> tool server
 */
async function main() {
  if (process.argv[2] === 'telegram') {
    await runTelegram(process.argv.slice(3), process.env)
    return
  }
  const config = await readConfig(process.argv.slice(2), process.env)
  const messages = config.messages
  if (config.help) {
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\nangela telegram [--help]\n\n${[
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
    const interactive = process.stdin.isTTY && config.prompt === undefined
    const output = new Output(messages)
    const permissions = new Permissions(messages)
    if (interactive)
      output.intro()
    process.stderr.write(`${messages.session}: ${session.record.id}\n`)
    if (session.record.interrupted)
      process.stderr.write(`${messages.incompleteSession}\n`)
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
    let mcp: McpTools | undefined

    let voice: Voice | undefined

    async function send(text: string) {
      let answer = ''
      active = new AbortController()
      let completed = false
      try {
        output.start()
        await session.save(chat.conversation, true)
        await chat.send(text, {
          abortSignal: active.signal,
          tools: mcp?.definitions(),
          diagnostics: {
            // The send catch owns the final message. SDK promise diagnostics must not print the same failure again.
            error() {},
            warn() { output.retry() },
          },
          onStreamEvent: (event) => {
            output.event(event)
            if (event.type === 'text-delta')
              answer += event.text
          },
        })
        if (!output.hasText)
          throw new Error(messages.emptyResponse)
        completed = true
        output.stop()
        if (voice)
          await voice.speak(answer, active.signal)
      }
      catch (error) {
        output.stop()
        process.stderr.write(`\n${active.signal.aborted ? messages.interrupted : `${messages.failed}: ${formatRequestError(error, messages)}`}\n`)
        if (!interactive && process.exitCode !== 143)
          process.exitCode = active.signal.aborted ? 130 : 1
      }
      finally {
        output.stop()
        active = undefined
        await session.save(chat.conversation, !completed)
      }
    }

    try {
      if (config.computerUse || config.mcpCommand) {
        mcp = await McpTools.connect(config, workspace, join(config.dataDir, 'computer-use', session.record.id), async (request, signal) => {
          output.approval(request)
          if (permissions.fullAccess) {
            signal?.throwIfAborted()
            output.decided(true)
            return true
          }
          if (!input) {
            output.decided(false)
            return false
          }
          const approved = (await input.ask(`\n${messages.approve} `, signal))?.trim().toLowerCase() === 'yes'
          output.decided(approved)
          return approved
        }, messages, process.env, shutdown.signal)
        process.stderr.write(`${messages.mcpConnected}\n`)
      }
      if (input && interactive) {
        process.stderr.write(`${messages.workspace}: ${workspace}\n${messages.welcome}\n${messages.permissionAsk}\n`)
        while (true) {
          let text = (await input.ask(voice ? messages.voicePrompt : output.prompt(), undefined, messages.cliCommands))?.trim()
          if (text === '/voice') {
            try {
              voice ??= new Voice(process.env, messages)
              process.stderr.write(`${messages.voiceReady}\n`)
            }
            catch (error) {
              process.stderr.write(`${errorMessageFrom(error)}\n`)
            }
            continue
          }
          if (text === '/chat') {
            voice = undefined
            process.stderr.write(`${messages.chatReady}\n`)
            continue
          }
          if (voice && text === '') {
            active = new AbortController()
            const capture = active
            try {
              text = await voice.listen(() => input!.ask(messages.voiceRecord, capture.signal), capture.signal)
            }
            catch (error) {
              process.stderr.write(`${capture.signal.aborted ? messages.interrupted : errorMessageFrom(error)}\n`)
              continue
            }
            finally {
              capture.abort()
              active = undefined
            }
            if (text?.trim() === '/chat') {
              voice = undefined
              process.stderr.write(`${messages.chatReady}\n`)
              continue
            }
            if (text && !text.startsWith('/'))
              process.stderr.write(`${text}\n`)
          }
          output.submitted()
          if (text === undefined || text === '/exit')
            break
          if (text === '/help') {
            process.stderr.write(`${messages.cliCommands}\n`)
            continue
          }
          const commandResponse = permissions.command(text)
          if (commandResponse !== undefined) {
            process.stderr.write(`${commandResponse}\n`)
            continue
          }
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
      await mcp?.close()
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
