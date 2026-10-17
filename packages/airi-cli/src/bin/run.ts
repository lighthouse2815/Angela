#!/usr/bin/env node

import type { Tool } from '@xsai/shared-chat'

import process from 'node:process'

import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { errorMessageFrom } from '@moeru/std'
import { chatMessagesToTurns } from '@proj-airi/core-agent'
import { getGenerationProvider, listProviders } from '@proj-airi/provider-inference'

import { Chat } from '../chat'
import { readConfig } from '../config'
import { runDoctor } from '../doctor'
import { formatRequestError } from '../errors'
import { McpTools } from '../mcp'
import { Memory } from '../memory'
import { Output } from '../output'
import { Camera } from '../perception/camera'
import { Permissions } from '../permissions'
import { ProjectMemory } from '../project-memory'
import { Recall } from '../recall'
import { ReminderNotifications } from '../reminder-notifications'
import { ReminderScheduler } from '../reminder-scheduler'
import { runSessionCommand } from '../session-command'
import { Sessions } from '../sessions'
import { StreamingSpeech } from '../streaming-speech'
import { taskCommand } from '../task-commands'
import { taskContext, taskTools } from '../task-tools'
import { Tasks } from '../tasks'
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
  if (process.argv[2] === 'doctor') {
    await runDoctor(process.argv.slice(3), process.env)
    return
  }
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
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\nangela doctor [--json] [--help]\nangela telegram [--help]\nangela voice start|stop|status [--help]\nangela sessions list|usage|delete ID|cleanup-audio [--help]\n\n${[
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
    const modelTarget = { model: config.model, chatProvider: provider, providerId: definition.id }
    const persona = chat.conversation.turns.filter(turn => turn.type === 'system').flatMap(turn => turn.content).flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
    await session.save(chat.conversation, session.record.interrupted)
    const interactive = process.stdin.isTTY && config.prompt === undefined
    const output = new Output(messages)
    const permissions = new Permissions(messages)
    const camera = new Camera(process.env, messages)
    let input: Terminal | undefined
    const tasks = new Tasks(config.dataDir, messages.tasks)
    const memory = new Memory(config.dataDir, messages)
    const project = await ProjectMemory.open(config.dataDir, workspace, messages)
    const recall = new Recall(config.dataDir, project.workspace, session.record.id, messages, process.env, config)
    let recallReady = false
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
    let voiceReady = false
    let reminderWake: AbortController | undefined
    const notifications = new ReminderNotifications(messages.tasks, config.locale, async (text, announced) => {
      if (input) {
        await input.notify(text)
      }
      else {
        await new Promise<void>((resolve, reject) => {
          process.stderr.write(`\n${text}\n`, error => error ? reject(error) : resolve())
        })
      }
      if (announced.length)
        chat.conversation.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: text }]))
      if (voiceReady && !input?.hasInput)
        reminderWake?.abort()
    })
    const scheduler = new ReminderScheduler(tasks, notifications, (error) => {
      const text = `${messages.tasks.unavailable} ${errorMessageFrom(error) ?? messages.tasks.failed}`
      if (input)
        void input.notify(text).catch(() => {})
      else
        process.stderr.write(`\n${text}\n`)
    })

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
      notifications.pause()
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
        const verifiedObservations: string[] = []
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
          memoryTools = await memory.tools(text, session.record.id)
        }
        catch {
          process.stderr.write(`\n${messages.memoryUnavailable}\n`)
        }
        try {
          if (recallReady) {
            const prepared = await recall.prepare(text, active.signal)
            memoryContext = prepared.context
            if (prepared.warning)
              process.stderr.write(`\n${prepared.warning}\n`)
          }
          else {
            const state = await memory.read()
            memoryContext = await memory.context(state.entries.filter(entry => entry.core).map(entry => entry.id))
          }
        }
        catch {
          memoryContext = ''
          active.signal.throwIfAborted()
          process.stderr.write(`\n${recallReady ? messages.recallInvalid : messages.memoryUnavailable}\n`)
        }
        const tools = [...(mcp?.definitions() ?? []), ...memoryTools, ...projectTools, ...taskTools(tasks, messages.tasks), ...(recallReady ? [...recall.tools(), ...recall.skills.tools(text, verifiedObservations, session.record.id, () => recall.changed(false))] : [])]
        await chat.send(text, {
          abortSignal: active.signal,
          tools,
          resolveStep: async () => ({
            ...modelTarget,
            systemPrompt: [persona, camera.getContext()].filter(Boolean).join('\n\n'),
            tools,
          }),
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
              if (event.type === 'tool-result') {
                try {
                  const result = CallToolResultSchema.safeParse(typeof event.result === 'string' ? JSON.parse(event.result) : event.result)
                  const backend = result.success ? result.data.structuredContent?.backendResult : undefined
                  const failed = backend && typeof backend === 'object' && (('timedOut' in backend && backend.timedOut) || ('exitCode' in backend && backend.exitCode !== undefined && backend.exitCode !== null && backend.exitCode !== 0))
                  if (result.success && !result.data.isError && !failed) {
                    verifiedObservations.push(observation.slice(0, 20_000))
                    if (verifiedObservations.length > 8)
                      verifiedObservations.shift()
                  }
                }
                catch { /* Unrecognized payloads cannot establish verification evidence. */ }
              }
              if (projectObservations.length > 8)
                projectObservations.shift()
            }
            if (event.type === 'text-delta')
              await speech?.push(event.text)
          },
        }, [memoryContext, projectContext, taskContext(tasks)].filter(Boolean).join('\n\n'))
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
          notifications.resume()
        }
      }
    }

    try {
      try {
        await recall.start()
        recallReady = true
      }
      catch {
        await recall.close()
        process.stderr.write(`${messages.recallInvalid}\n`)
      }
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
      await scheduler.start()
      if (input && interactive) {
        process.stderr.write(`${messages.workspace}: ${workspace}\n${messages.welcome}\n${messages.permissionAsk}\n`)
        while (!shutdown.signal.aborted) {
          const cameraNotice = camera.takeNotice()
          if (cameraNotice)
            process.stderr.write(`${cameraNotice}\n`)
          notifications.setVoiceEnabled(Boolean(voice))
          if (voice && notifications.hasSpeech) {
            const speaking = new AbortController()
            active = speaking
            await notifications.speak(voice, AbortSignal.any([speaking.signal, shutdown.signal]))
            if (speaking.signal.aborted)
              voice = undefined
            active = undefined
          }
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
            const wake = new AbortController()
            reminderWake = wake
            try {
              const result = await voice.listen(signal => input!.ask('', signal, messages.cliCommands), AbortSignal.any([capture.signal, wake.signal]), (state) => {
                voiceReady = state === 'ready'
                if (voiceReady && notifications.hasSpeech && !input?.hasInput)
                  wake.abort()
                const label = state === 'ready' ? messages.voicePrompt : state === 'speech' ? messages.voiceRecord : messages.voiceTranscribing
                process.stderr.write(`${camera.enabled ? `${messages.cameraIndicator} | ` : ''}${label}\n`)
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
              if (wake.signal.aborted && !capture.signal.aborted && !shutdown.signal.aborted)
                continue
              process.stderr.write(`${capture.signal.aborted ? messages.interrupted : errorMessageFrom(error)}\n`)
              voice = undefined
              process.stderr.write(`${messages.chatReady}\n`)
              continue
            }
            finally {
              capture.abort()
              active = undefined
              voiceReady = false
              reminderWake = undefined
            }
          }
          else {
            text = (await input.ask(`${camera.enabled ? `${messages.cameraIndicator}\n` : ''}${output.prompt()}`, undefined, messages.cliCommands))?.trim()
          }
          if (text === '/voice') {
            try {
              voice ??= loadedVoice ?? await Voice.load(process.env, messages)
              loadedVoice = voice
              notifications.setVoiceEnabled(true)
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
            notifications.setVoiceEnabled(false)
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
          active = new AbortController()
          try {
            const response = await camera.command(text, active.signal) ?? await taskCommand(text, tasks, messages.tasks, config.locale) ?? await project.command(text) ?? await recall.command(text, active.signal) ?? await recall.skills.command(text) ?? await memory.command(text)
            if (response !== undefined) {
              if (recallReady && /^\/(?:remember |forget |memory (?:edit |pin |unpin |auto |on$|off$)|skills (?:import |edit |forget |on|off))/u.test(text))
                await recall.changed()
              process.stderr.write(`${response}\n`)
              continue
            }
          }
          catch (error) {
            process.stderr.write(`${errorMessageFrom(error)}\n`)
            continue
          }
          finally {
            active = undefined
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
      try {
        if (!shutdown.signal.aborted) {
          notifications.resume()
          await scheduler.refresh()
        }
        await scheduler.close()
        notifications.resume()
        await session.save(chat.conversation, session.record.interrupted)
      }
      finally {
        input?.close()
        try {
          await camera.close()
          await releaseVoice()
        }
        finally {
          try {
            await mcp?.close()
          }
          finally {
            try {
              await recall.close()
            }
            finally {
              process.off('SIGINT', interrupt)
              process.off('SIGTERM', stop)
            }
          }
        }
      }
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
