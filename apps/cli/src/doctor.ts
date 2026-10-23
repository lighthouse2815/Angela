import type { cliMessages } from '@angela/i18n/cli'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readdir, realpath, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs, promisify } from 'node:util'

import { Context } from '@angela/companion/context'
import { Memory } from '@angela/companion/memory'
import { ProjectMemory } from '@angela/companion/project-memory'
import { Sessions } from '@angela/companion/sessions'
import { readConfig } from '@angela/host-sdk/config'
import { Voice } from '@angela/voice-client/voice'

import * as v from 'valibot'

const modelsSchema = v.object({ data: v.array(v.object({ id: v.string() })) })
interface Check { id: string, status: 'ok' | 'warning' | 'error', message: string }

/** Runs bounded read-only checks. Never generates chat, opens audio devices, changes files, or prints provider error bodies. */
export class Doctor {
  constructor(private readonly args: string[], private readonly env: NodeJS.ProcessEnv, private readonly messages: typeof cliMessages.en) {}

  async inspect() {
    const checks: Check[] = []
    const add = (id: string, status: Check['status'], message: string) => checks.push({ id, status, message })
    const local = await readConfig(['--list-sessions', ...this.args], this.env)
    if (local.help || !local.list)
      throw new Error(this.messages.doctorUsage)
    try {
      const context = new Context(Number(this.env.ANGELA_CONTEXT_TOKENS ?? 32_000), this.messages)
      add('context', 'ok', `${this.messages.doctorContext} ${context.status.limit}`)
    }
    catch {
      add('context', 'error', this.messages.contextLimit)
    }
    try {
      const config = await readConfig(this.args, this.env)
      if (config.help || config.list)
        throw new Error(this.messages.doctorConfig)
      add('config', 'ok', this.messages.doctorConfigReady)
      if (!['openai', 'openai-compatible'].includes(config.definitionId) || !config.baseUrl) {
        add('api', 'warning', this.messages.doctorApiUnsupported)
      }
      else {
        try {
          const url = new URL('models', `${config.baseUrl.replace(/\/+$/u, '')}/`)
          const response = await fetch(url, {
            headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          })
          if (!response.ok) {
            await response.body?.cancel()
            add('api', 'error', `${this.messages.doctorApiHttp} ${response.status}. ${[401, 403].includes(response.status) ? this.messages.doctorAuth : this.messages.doctorApiFix}`)
          }
          else {
            const reader = response.body?.getReader()
            let bytes = 0
            let body = ''
            const decoder = new TextDecoder()
            try {
              if (!reader)
                throw new Error('Missing response')
              while (true) {
                const chunk = await reader.read()
                if (chunk.done)
                  break
                bytes += chunk.value.byteLength
                if (bytes > 2_000_000)
                  throw new Error('Model list too large')
                body += decoder.decode(chunk.value, { stream: true })
              }
              body += decoder.decode()
              const parsed = v.safeParse(modelsSchema, JSON.parse(body))
              if (!parsed.success)
                throw new Error('Invalid model list')
              add('api', 'ok', this.messages.doctorApiReady)
              const listed = parsed.output.data.some(model => model.id === config.model)
              add('model', listed ? 'ok' : 'warning', listed ? this.messages.doctorModelReady : this.messages.doctorModelMissing)
            }
            finally {
              await reader?.cancel().catch(() => {})
            }
          }
        }
        catch {
          add('api', 'error', this.messages.doctorApiFix)
        }
      }
    }
    catch {
      add('config', 'error', this.messages.doctorConfig)
    }

    try {
      let path = local.dataDir
      while (true) {
        try {
          if (!(await stat(path)).isDirectory())
            throw new Error('Not a directory')
          await access(path, constants.R_OK | constants.W_OK | constants.X_OK)
          break
        }
        catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(path) === path)
            throw error
          path = dirname(path)
        }
      }
      add('storage', 'ok', this.messages.doctorStorageReady)
    }
    catch {
      add('storage', 'error', this.messages.doctorStorageFix)
    }
    try {
      await new Memory(local.dataDir, this.messages).read()
      add('personal-memory', 'ok', this.messages.doctorMemoryReady)
    }
    catch {
      add('personal-memory', 'warning', this.messages.memoryInvalid)
    }
    try {
      // Workspace checks remain available when provider configuration is invalid.
      const { values } = parseArgs({ args: this.args, strict: false, allowPositionals: true, options: { cwd: { type: 'string' } } })
      const workspace = typeof values.cwd === 'string' ? values.cwd : process.cwd()
      const project = await ProjectMemory.open(local.dataDir, await realpath(workspace), this.messages)
      await project.read()
      add('project-memory', 'ok', this.messages.doctorProjectReady)
    }
    catch {
      add('project-memory', 'warning', this.messages.projectMemoryInvalid)
    }
    const history = new Sessions(local.dataDir, this.messages)
    try {
      const files = await this.files(local.dataDir)
      let invalid = 0
      for (const file of files.filter(file => /^[\da-f-]{36}\.json$/iu.test(file))) {
        try {
          await history.read(file.slice(0, -5))
        }
        catch {
          invalid++
        }
      }
      add('history', invalid ? 'warning' : 'ok', invalid ? this.messages.doctorHistoryFix : this.messages.doctorHistoryReady)
    }
    catch {
      add('history', 'warning', this.messages.doctorHistoryFix)
    }
    try {
      const lockDirectories = [local.dataDir, join(local.dataDir, 'memory'), join(local.dataDir, 'memory', 'projects')]
      let locks = 0
      for (const directory of lockDirectories)
        locks += (await this.files(directory)).filter(file => file.endsWith('.lock')).length
      add('locks', locks ? 'warning' : 'ok', locks ? this.messages.doctorLocksFix : this.messages.doctorLocksReady)
    }
    catch {
      add('locks', 'warning', this.messages.doctorLocksFix)
    }
    const audio = await Promise.allSettled([
      Voice.load(this.env, this.messages).then(voice => voice.healthy()),
      promisify(execFile)('pw-record', ['--version'], { timeout: 3000, env: this.env }),
      promisify(execFile)('pw-play', ['--version'], { timeout: 3000, env: this.env }),
      promisify(execFile)('pactl', ['list', 'short', 'sources'], { timeout: 3000, env: this.env }),
      promisify(execFile)('pactl', ['list', 'short', 'sinks'], { timeout: 3000, env: this.env }),
    ] as const)
    const health = audio[0]
    add('voice-service', health.status === 'fulfilled' && health.value === true ? 'ok' : 'warning', health.status === 'fulfilled' && health.value === true ? this.messages.doctorVoiceReady : this.messages.doctorVoiceFix)
    const commands = audio[1].status === 'fulfilled' && audio[2].status === 'fulfilled'
    add('audio-commands', commands ? 'ok' : 'warning', commands ? this.messages.voiceToolsReady : this.messages.voicePlatform)
    const sources = audio[3]
    const sinks = audio[4]
    const devices = sources.status === 'fulfilled' && sources.value.stdout.trim() && sinks.status === 'fulfilled' && sinks.value.stdout.trim()
    add('audio-devices', devices ? 'ok' : 'warning', devices ? this.messages.doctorDevicesReady : this.messages.doctorDevicesFix)
    add('echo-cancellation', 'warning', this.messages.doctorEcho)
    return checks
  }

  private async files(directory: string) {
    try {
      return await readdir(directory)
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return []
      throw error
    }
  }
}

/**
 * Prints independent diagnostics without starting a chat session.
 * Call stack: runDoctor -> Doctor.inspect -> configuration, storage, HTTP GET, PipeWire queries.
 */
export async function runDoctor(args: string[], env: NodeJS.ProcessEnv) {
  const json = args.includes('--json')
  const rest = args.filter(arg => arg !== '--json')
  const config = await readConfig(['--list-sessions', ...rest], env)
  if (config.help) {
    process.stdout.write(`${config.messages.doctorUsage}\n`)
    return
  }
  const checks = await new Doctor(rest, env, config.messages).inspect()
  const healthy = checks.every(check => check.status !== 'error')
  process.stdout.write(json ? `${JSON.stringify({ healthy, checks }, null, 2)}\n` : `${checks.map(check => `[${check.status}] ${check.id}: ${check.message}`).join('\n')}\n`)
  if (!healthy)
    process.exitCode = 1
}
