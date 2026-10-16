#!/usr/bin/env node

import type { Tool } from '@xsai/shared-chat'

import process from 'node:process'

import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { getGenerationProvider, listProviders } from '@proj-airi/provider-inference'

import { Chat } from '../chat'
import { readConfig } from '../config'
import { formatRequestError } from '../errors'
import { McpTools } from '../mcp'
import { Memory } from '../memory'
import { Output } from '../output'
import { Permissions } from '../permissions'
import { ProjectMemory } from '../project-memory'
import { runSessionCommand } from '../session-command'
import { Sessions } from '../sessions'
import { StreamingSpeech } from '../streaming-speech'
import { runTelegram } from '../telegram'
import { Terminal } from '../terminal'
import { Voice } from '../voice'
import { VoiceInterruption } from '../voice-interruption'
import { runVoiceService } from '../voice-service'

/**
 * Runs terminal chat and owns input, signals, and provider configuration.
 *
 * Call stack:
 * main -> readConfig -> Chat.send -> core-agent.streamFrom
 *                    -> McpTools -> MCP client -> tool server
 */
async function main() {
  if (process.argv[2] === 'voice') {
    await runVoiceService(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'sessions') {
    await runSessionCommand(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'telegram') {
    await runTelegram(process.argv.slice(3), process.env)
    return
  }
  const config = await readConfig(process.argv.slice(2), process.env)
  const messages = config.messages
  if (config.help) {
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\nangela telegram [--help]\nangela voice start|stop|status [--help]\nangela sessions list|usage|delete ID|cleanup-audio [--help]\n\n${[
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

  // Temporary audio cleanup is best effort. It never deletes chat history or active playback.
  await Voice.cleanupTemporaryAudio().catch(() => {})
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
    const chat = new Chat(config.model, provider, workspace, session.restore(), true, Number(process.env.ANGELA_CONTEXT_TOKENS ?? 32_000), messages)
    await session.save(chat.conversation, session.record.interrupted)
    const interactive = process.stdin.isTTY && config.prompt === undefined
    const output = new Output(messages)
    const permissions = new Permissions(messages)
    let input: Terminal | undefined
    const memory = new Memory(config.dataDir, messages)
    const project = await ProjectMemory.open(config.dataDir, workspace, messages)
    if (interactive)
      output.intro()
    process.stderr.write(`${messages.session}: ${session.record.id}\n`)
    if (session.record.interrupted)
      process.stderr.write(`${messages.incompleteSession}\n`)
    let active: AbortController | undefined
    const shutdown = new AbortController()
    let voice: Voice | undefined
    let loadedVoice: Voice | undefined
    let interruption: VoiceInterruption | undefined
    const interrupt = () => {
      if (interruption) {
        interruption.cancel()
        voice = undefined
      }
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
      voice = undefined
      interruption?.cancel()
      active?.abort()
      shutdown.abort()
      input?.close()
      process.exitCode = 143
    }
    process.on('SIGTERM', stop)
    let mcp: McpTools | undefined

    let pendingUtterance: string | undefined

    async function releaseVoice() {
      try {
        await loadedVoice?.close()
        loadedVoice = undefined
      }
      catch {
        process.stderr.write(`${messages.voiceEchoCleanup}\n`)
      }
    }

    async function send(text: string) {
      active = new AbortController()
      const speech = voice ? new StreamingSpeech(voice, active.signal, () => process.stderr.write(`\n${messages.voiceSpeaking}\n`)) : undefined
      interruption = voice?.canInterrupt
        ? new VoiceInterruption(voice, active, (state) => {
            const label = state === 'ready' ? messages.voicePrompt : state === 'speech' ? messages.voiceRecord : messages.voiceTranscribing
            process.stderr.write(`${label}\n`)
          })
        : undefined
      let completed = false
      try {
        output.start()
        await session.save(chat.conversation, true)
        const projectObservations: string[] = []
        const projectCalls = new Set<string>()
        let projectContext = ''
        let projectTools: Tool[] = []
        try {
          projectContext = await project.context()
          projectTools = await project.tools(text, session.record.id, projectObservations)
        }
        catch {
          projectContext = ''
          process.stderr.write(`\n${messages.projectMemoryUnavailable}\n`)
        }
        let memoryContext = ''
        let memoryTools: Tool[] = []
        try {
          memoryContext = await memory.context()
          memoryTools = await memory.tools(text)
        }
        catch {
          memoryContext = ''
          process.stderr.write(`\n${messages.memoryUnavailable}\n`)
        }
        await chat.send(text, {
          abortSignal: active.signal,
          tools: [...(mcp?.definitions() ?? []), ...memoryTools, ...projectTools],
          diagnostics: {
            // The send catch owns the final message. SDK promise diagnostics must not print the same failure again.
            error() {},
            warn() { output.retry() },
          },
          onStreamEvent: async (event) => {
            output.event(event)
            if (event.type === 'tool-call' && event.toolName === 'builtIn_mcpCallTool')
              projectCalls.add(event.toolCallId)
            if ((event.type === 'tool-result' || event.type === 'tool-error') && projectCalls.delete(event.toolCallId) && event.result) {
              const observation = typeof event.result === 'string' ? event.result : JSON.stringify(event.result)
              projectObservations.push(observation.slice(0, 20_000))
              if (projectObservations.length > 8)
                projectObservations.shift()
            }
            if (event.type === 'text-delta')
              await speech?.push(event.text)
          },
        }, [memoryContext, projectContext].filter(Boolean).join('\n\n'))
        if (!output.hasText)
          throw new Error(messages.emptyResponse)
        completed = true
        await session.save(chat.conversation, false)
        output.stop()
        await speech?.finish()
      }
      catch (error) {
        if (active.signal.aborted && !interruption?.interrupted)
          voice = undefined
        output.stop()
        process.stderr.write(`\n${active.signal.aborted ? messages.interrupted : `${messages.failed}: ${formatRequestError(error, messages)}`}\n`)
        if (!interactive && process.exitCode !== 143)
          process.exitCode = active.signal.aborted ? 130 : 1
      }
      finally {
        await speech?.cancel()
        output.stop()
        try {
          await session.save(chat.conversation, !completed)
          const next = await interruption?.finish()
          pendingUtterance = voice ? next : undefined
        }
        finally {
          interruption?.cancel()
          interruption = undefined
          active = undefined
        }
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
          if (!voice)
            await releaseVoice()
          if (pendingUtterance && voice) {
            const utterance = pendingUtterance
            pendingUtterance = undefined
            process.stderr.write(`${utterance}\n`)
            await send(utterance)
            continue
          }
          let text: string | undefined
          if (voice) {
            active = new AbortController()
            const capture = active
            try {
              const result = await voice.listen(signal => input!.ask('', signal, messages.cliCommands), capture.signal, (state) => {
                const label = state === 'ready' ? messages.voicePrompt : state === 'speech' ? messages.voiceRecord : messages.voiceTranscribing
                process.stderr.write(`${label}\n`)
              })
              if (result.kind === 'transcript') {
                if (result.text) {
                  process.stderr.write(`${result.text}\n`)
                  capture.abort()
                  active = undefined
                  await send(result.text)
                }
                else {
                  process.stderr.write(`${messages.voiceEmpty}\n`)
                }
                continue
              }
              text = result.text
            }
            catch (error) {
              process.stderr.write(`${capture.signal.aborted ? messages.interrupted : errorMessageFrom(error)}\n`)
              voice = undefined
              process.stderr.write(`${messages.chatReady}\n`)
              continue
            }
            finally {
              capture.abort()
              active = undefined
            }
          }
          else {
            text = (await input.ask(output.prompt(), undefined, messages.cliCommands))?.trim()
          }
          if (text === '/voice') {
            try {
              voice ??= loadedVoice ?? await Voice.load(process.env, messages)
              loadedVoice = voice
              active = new AbortController()
              try {
                await voice.start(active.signal)
              }
              catch {
                if (active.signal.aborted) {
                  voice = undefined
                  continue
                }
                process.stderr.write(`${messages.voiceEchoUnavailable}\n`)
              }
              finally {
                active = undefined
              }
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
          output.submitted()
          if (text === undefined || text === '/exit')
            break
          if (text === '/context') {
            process.stderr.write(`${messages.contextStatus} ${JSON.stringify(chat.context.status)}\n`)
            continue
          }
          if (text === '/help') {
            process.stderr.write(`${messages.cliCommands}\n`)
            continue
          }
          try {
            const response = await project.command(text) ?? await memory.command(text)
            if (response !== undefined) {
              process.stderr.write(`${response}\n`)
              continue
            }
          }
          catch (error) {
            process.stderr.write(`${errorMessageFrom(error)}\n`)
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
      try {
        await releaseVoice()
      }
      finally {
        await mcp?.close()
      }
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
