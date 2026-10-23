#!/usr/bin/env node

import type { Camera } from '@angela/vision/perception/camera'
import type { Voice } from '@angela/voice-client/voice'
import type { VoiceInterruption } from '@angela/voice-client/voice-interruption'

import process from 'node:process'

import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { ReminderNotifications } from '@angela/companion/reminder-notifications'
import { Sessions } from '@angela/companion/sessions'
import { chatMessagesToTurns } from '@angela/core-agent'
import { readConfig } from '@angela/host-sdk/config'
import { formatRequestError } from '@angela/host-sdk/errors'
import { Output } from '@angela/host-sdk/output'
import { Permissions } from '@angela/host-sdk/permissions'
import { errorMessageFrom } from '@moeru/std'

import { Terminal } from '../terminal'

/**
 * Runs terminal chat and owns input, signals, and provider configuration.
 *
 * Call stack:
 * main -> readConfig -> RuntimeSession.send -> Chat.send -> core-agent.streamFrom
 *                    -> McpTools -> MCP client -> tool server
 */
async function main() {
  if (process.argv[2] === 'gateway') {
    const { runGateway } = await import('../gateway-command')
    await runGateway(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'tasks' || process.argv[2] === 'task') {
    const { runTaskCli } = await import('../task-cli')
    await runTaskCli(process.argv.slice(3), process.env, process.argv[2] === 'tasks')
    return
  }
  if (process.argv[2] === 'zalo' || process.argv[2] === 'away') {
    const { runZalo } = await import('@angela/zalo/zalo-command')
    await runZalo(process.argv.slice(3), process.env, process.argv[2] === 'away')
    return
  }
  if (process.argv[2] === 'eval') {
    const { runEvaluation } = await import('../evaluation')
    await runEvaluation(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'setup') {
    const { runSetup } = await import('../setup')
    await runSetup(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'reminders') {
    const { runReminders } = await import('../reminders')
    await runReminders(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'doctor') {
    const { runDoctor } = await import('../doctor')
    await runDoctor(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'voice') {
    const { runVoiceService } = await import('../voice-service')
    await runVoiceService(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'sessions') {
    const { runSessionCommand } = await import('../session-command')
    await runSessionCommand(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'telegram') {
    const { runTelegram } = await import('@angela/telegram/telegram')
    await runTelegram(process.argv.slice(3), process.env)
    return
  }
  if (process.argv[2] === 'discord') {
    const { runDiscord } = await import('@angela/discord-companion/discord')
    await runDiscord(process.argv.slice(3), process.env)
    return
  }
  if (process.stdin.isTTY && process.stderr.isTTY) {
    const { Startup } = await import('../startup')
    const startup = new Startup()
    // Chat installs turn-aware cancellation after runtime initialization. Before that, interruption exits after gateway cleanup.
    const cancelStartup = () => {
      void startup.close().finally(() => process.exit(130))
    }
    try {
      const selection = await startup.open(process.argv.slice(2), process.env)
      if (selection) {
        process.once('SIGINT', cancelStartup)
        await runChat(selection.args, selection.env, () => process.off('SIGINT', cancelStartup))
      }
    }
    finally {
      process.off('SIGINT', cancelStartup)
      await startup.close()
    }
    return
  }
  await runChat(process.argv.slice(2), process.env)
}

/**
 * Runs chat after interactive provider selection or explicit command-line configuration.
 *
 * Call stack:
 * main -> Startup.open -> runChat -> AngelaRuntime -> Chat.send
 */
async function runChat(args: string[], env: NodeJS.ProcessEnv, inputReady?: () => void) {
  const config = await readConfig(args, env)
  const messages = config.messages
  if (config.help) {
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\nangela tasks [all]\nangela task show|done|cancel|snooze ID [DURATION]\nangela eval [--help]\nangela setup [--help]\nangela reminders install|start|stop|status|run [--help]\nangela doctor [--json] [--help]\nangela telegram [--help]\nangela discord [--help]\nangela zalo login|logout|status|run [--help]\nangela away on|off|status [--help]\nangela voice start|stop|status [--help]\nangela sessions list|usage|delete ID|cleanup-audio [--help]\n\n${[
      ['angela gateway --help', messages.gateway.description],
      ['--menu / --no-menu', messages.startup.menu],
      ['--model', messages.model],
      ['--provider', messages.provider],
      ['--config', messages.configFile],
      ['--base-url', messages.baseUrl],
      ['--api', messages.protocol],
      ['--prompt, -p', messages.prompt],
      ['--cwd', messages.cwd],
      ['--locale', messages.locale],
      ['--help, -h', messages.help],
      ['--computer-use / --no-computer-use', messages.computerUse],
      ['--mcp-command', messages.mcpCommand],
      ['--mcp-arg', messages.mcpArg],
      ['--resume', messages.resume],
      ['--list-sessions', messages.listSessions],
      ['--data-dir', messages.dataDir],
    ].map(([flag, text]) => `  ${flag.padEnd(16)} ${text}`).join('\n')}\n`)
    return
  }

  const sessions = new Sessions(config.dataDir, messages)
  if (config.list) {
    const list = await sessions.list()
    process.stdout.write(list.length ? `${list.map(session => JSON.stringify(session)).join('\n')}\n` : `${messages.noSessions}\n`)
    return
  }
  // An explicit workspace wins. Resumed sessions otherwise retain their recorded workspace.
  const previousWorkspace = config.resume ? (await sessions.read(config.resume)).workspace : undefined
  const workspace = await realpath(config.cwd ?? previousWorkspace ?? process.cwd())
  if (!(await stat(workspace)).isDirectory())
    throw new Error(messages.invalidWorkspace)
  const session = await sessions.open(workspace, config.resume, { recoverAbandoned: true })
  try {
    const { getGenerationProvider, listProviders } = await import('@angela/provider-inference')
    const definition = listProviders().find(provider => provider.id === config.definitionId)
    if (!definition)
      throw new Error(`${messages.unsupportedProvider}: ${config.definitionId}`)
    const provider = getGenerationProvider(await definition.createProvider(config.providerConfig))
    if (!provider)
      throw new Error(`${messages.unsupportedProvider}: ${config.definitionId}`)
    const { AngelaRuntime } = await import('@angela/companion/runtime/runtime')
    const runtime = new AngelaRuntime(config.model, provider, messages, env, config)
    const chat = await runtime.createChat(workspace, session.restore(), true, Number(env.ANGELA_CONTEXT_TOKENS ?? 32_000))
    const modelTarget = { model: config.model, chatProvider: provider, providerId: definition.id }
    const persona = chat.conversation.turns.filter(turn => turn.type === 'system').flatMap(turn => turn.content).flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
    await session.saveChat(chat, session.record.interrupted)
    const interactive = process.stdin.isTTY && config.prompt === undefined
    const output = new Output(messages)
    const permissions = new Permissions(messages)
    let camera: Camera | undefined
    let input: Terminal | undefined
    const scope = runtime.open({
      dataDir: config.dataDir,
      workspace,
      sessionId: session.record.id,
      channel: 'cli',
      locale: config.locale,
      warn: message => process.stderr.write(`\n${message}\n`),
      connectMcp: config.computerUse || config.mcpCommand
        ? async (signal) => {
          const { McpTools } = await import('@angela/companion/mcp')
          const tools = await McpTools.connect(config, workspace, join(config.dataDir, 'computer-use', session.record.id), async (request, approvalSignal) => {
            output.approval(request)
            if (permissions.fullAccess) {
              approvalSignal?.throwIfAborted()
              output.decided(true)
              return true
            }
            if (!input) {
              output.decided(false)
              return false
            }
            const approved = (await input.ask(`\n${messages.approve} `, approvalSignal))?.trim().toLowerCase() === 'yes'
            output.decided(approved)
            return approved
          }, messages, env, signal)
          process.stderr.write(`${messages.mcpConnected}\n`)
          return tools
        }
        : undefined,
    })
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
    inputReady?.()
    if (process.stdin.isTTY)
      input = new Terminal(interrupt)
    const stop = (signal: NodeJS.Signals) => {
      voice = undefined
      interruption?.cancel()
      active?.abort()
      shutdown.abort()
      input?.close()
      process.exitCode = signal === 'SIGHUP' ? 129 : 143
    }
    process.on('SIGTERM', stop)
    process.on('SIGHUP', stop)

    let pendingUtterance: string | undefined
    let voiceReady = false
    let reminderWake: AbortController | undefined
    const notifications = new ReminderNotifications(messages.tasks, config.locale, async (text, announced, _signal, loop) => {
      if (input) {
        await input.notify(text)
      }
      else {
        await new Promise<void>((resolve, reject) => {
          process.stderr.write(`\n${text}\n`, error => error ? reject(error) : resolve())
        })
      }
      if (loop)
        await scope.mentionOpenLoop(loop)
      if (announced.length || loop) {
        if (announced.length)
          await scope.mentionCommitments(announced)
        chat.conversation.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: text }]))
      }
      if (voiceReady && !input?.hasInput)
        reminderWake?.abort()
    })
    const scheduler = await runtime.reminders(config.dataDir, notifications, (error) => {
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
      const speech = voice ? new (await import('@angela/voice-client/streaming-speech')).StreamingSpeech(voice, active.signal, () => process.stderr.write(`\n${messages.voiceSpeaking}\n`)) : undefined
      interruption = voice?.canInterrupt
        ? new (await import('@angela/voice-client/voice-interruption')).VoiceInterruption(voice, active, (state) => {
            const label = state === 'ready' ? messages.voicePrompt : state === 'speech' ? messages.voiceRecord : messages.voiceTranscribing
            process.stderr.write(`${label}\n`)
          })
        : undefined
      let completed = false
      try {
        output.start()
        await session.saveChat(chat, true)
        await scope.send(chat, text, {
          abortSignal: active.signal,
          resolveStep: async () => ({
            ...modelTarget,
            systemPrompt: [persona, camera?.getContext()].filter(Boolean).join('\n\n'),
          }),
          diagnostics: {
            // The send catch owns the final message. SDK promise diagnostics must not print the same failure again.
            error() {},
            warn() { output.retry() },
          },
          onStreamEvent: async (event) => {
            output.event(event)
            if (event.type === 'text-delta')
              await speech?.push(event.text)
          },
        })
        if (!output.hasText)
          throw new Error(messages.emptyResponse)
        completed = true
        await session.saveChat(chat, false)
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
          await session.saveChat(chat, !completed)
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
      await scheduler.start()
      if (input && interactive) {
        process.stderr.write(`${messages.workspace}: ${workspace}\n${messages.welcome}\n${messages.permissionAsk}\n`)
        while (!shutdown.signal.aborted) {
          const cameraNotice = camera?.takeNotice()
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
                process.stderr.write(`${camera?.enabled ? `${messages.cameraIndicator} | ` : ''}${label}\n`)
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
            text = (await input.ask(`${camera?.enabled ? `${messages.cameraIndicator}\n` : ''}${output.prompt()}`, undefined, messages.cliCommands))?.trim()
          }
          if (text === '/voice') {
            try {
              const { Voice } = await import('@angela/voice-client/voice')
              await Voice.cleanupTemporaryAudio().catch(() => {})
              voice ??= loadedVoice ?? await Voice.load(env, messages)
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
            if (/^\/camera(?:\s|$)/u.test(text))
              camera ??= new (await import('@angela/vision/perception/camera')).Camera(env, messages)
            const response = /^\/(?:away|zalo)(?:\s|$)/u.test(text)
              ? await (await import('@angela/zalo/zalo-command')).ownerAwayCommand(text, config.dataDir, messages)
              : await camera?.command(text, active.signal) ?? await scope.command(text, active.signal)
            if (response !== undefined) {
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
        await session.saveChat(chat, session.record.interrupted)
      }
      finally {
        input?.close()
        try {
          await camera?.close()
          await releaseVoice()
        }
        finally {
          try {
            await runtime.close()
          }
          finally {
            process.off('SIGINT', interrupt)
            process.off('SIGTERM', stop)
            process.off('SIGHUP', stop)
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
