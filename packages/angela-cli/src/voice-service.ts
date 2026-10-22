import process from 'node:process'

import { execFile, spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'

import { readConfig } from './config'
import { Voice } from './voice'

/** Finds the checked-out voice service from the executable, independent of the caller's current directory. */
async function composePath(override: string | undefined) {
  if (override) {
    const path = resolve(override)
    return (await stat(path)).isFile() ? path : undefined
  }
  let directory = dirname(fileURLToPath(import.meta.url))
  while (true) {
    const path = join(directory, 'services', 'voice-local', 'compose.yaml')
    try {
      if ((await stat(path)).isFile())
        return path
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        throw error
    }
    const parent = dirname(directory)
    if (parent === directory)
      return undefined
    directory = parent
  }
}

/** Controls the local container without deleting models or accessing the chat provider. */
export async function runVoiceService(args: string[], env: NodeJS.ProcessEnv) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { locale: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  const { messages } = await readConfig(['--help', ...(values.locale ? ['--locale', values.locale] : [])], env)
  const action = positionals[0] ?? 'status'
  if (values.help) {
    process.stdout.write(`${messages.voiceServiceUsage}\n`)
    return
  }
  if (positionals.length > 1 || !['start', 'stop', 'status'].includes(action))
    throw new Error(messages.voiceServiceUsage)
  const path = await composePath(env.ANGELA_VOICE_COMPOSE)
  if (!path)
    throw new Error(messages.voiceServiceMissing)
  const command = action === 'start' ? ['up', '-d', '--build'] : action === 'stop' ? ['stop'] : ['ps']
  let child: ReturnType<typeof spawn> | undefined
  let cancelled = false
  const interrupt = () => {
    cancelled = true
    child?.kill('SIGINT')
  }
  const terminate = () => {
    cancelled = true
    process.exitCode = 143
    child?.kill('SIGTERM')
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  try {
    await new Promise<void>((done, reject) => {
      child = spawn('docker', ['compose', '--file', path, ...command, 'voice'], { stdio: 'inherit', env })
      child.once('error', () => reject(new Error(messages.voiceDockerMissing)))
      child.once('close', (code) => {
        if (cancelled) {
          if (process.exitCode !== 143)
            process.exitCode = 130
          done()
        }
        else if (code === 0) {
          done()
        }
        else {
          reject(new Error(messages.voiceServiceFailed))
        }
      })
    })
  }
  finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
  if (cancelled || action === 'stop')
    return
  if (action === 'start')
    await Voice.configureLocal(env)
  const voice = await Voice.load(env, messages)
  let healthy = await voice.healthy()
  if (action === 'start') {
    for (let attempt = 0; !healthy && attempt < 10; attempt++) {
      await setTimeout(1000)
      healthy = await voice.healthy()
    }
  }
  const tools = await Promise.allSettled([
    promisify(execFile)('pw-record', ['--version'], { timeout: 3000, env }),
    promisify(execFile)('pw-play', ['--version'], { timeout: 3000, env }),
  ])
  const pipewire = tools.every(tool => tool.status === 'fulfilled')
  process.stdout.write(`${healthy ? messages.voiceServiceReady : messages.voiceServiceOffline}\n${pipewire ? messages.voiceToolsReady : messages.voicePlatform}\n`)
  if (!healthy || !pipewire)
    process.exitCode = 1
}
