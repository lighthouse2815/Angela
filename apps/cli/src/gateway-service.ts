import type { cliMessages } from '@angela/i18n/cli'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

import * as v from 'valibot'

import { Gateway } from './gateway'
import { unitArgument } from './systemd'

const execute = promisify(execFile)
const service = 'angela-gateway.service'

/**
 * Owns a systemd user unit. The service runs the foreground host, which owns its engine and directory lock.
 * systemd tracks process identity and shutdown. No command signals an unverified PID from a saved lock file.
 * Installation preserves existing units. Starting enables login startup. Stopping preserves that preference until disable.
 */
export class GatewayService {
  constructor(
    private readonly directory: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly messages: typeof cliMessages.en.gateway,
    private readonly locale: string,
    private readonly port?: number,
  ) {}

  async run(action: string) {
    if (!['install', 'start', 'stop', 'restart', 'status', 'disable'].includes(action))
      throw new Error(this.messages.usage)
    if (process.platform !== 'linux')
      throw new Error(this.messages.serviceLinux)
    if (action === 'install') {
      const entry = await realpath(resolve(process.argv[1] ?? '')).catch(() => '')
      if (!/\.m?js$/u.test(entry))
        throw new Error(this.messages.serviceBuild)
      const command = [process.execPath, entry, 'gateway', 'start', '--data-dir', this.directory, '--locale', this.locale]
      if (this.port !== undefined)
        command.push('--port', String(this.port))
      const unit = `[Unit]\nDescription=Angela Gateway\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=exec\nExecStart=${command.map(unitArgument).join(' ')}\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=15\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`
      const directory = join(this.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'systemd', 'user')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, service)
      try {
        await writeFile(path, unit, { flag: 'wx', mode: 0o600 })
      }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST' || await readFile(path, 'utf8') !== unit)
          throw new Error(this.messages.serviceExists)
      }
      await this.control(['daemon-reload'])
      process.stdout.write(`${this.messages.serviceInstalled}\n`)
      return
    }
    const gateway = new Gateway(this.directory, this.env, this.messages, this.port)
    if ((action === 'start' || action === 'restart') && (await gateway.status()).running && !await this.ownsHost())
      throw new Error(this.messages.locked)
    const args = action === 'start'
      ? ['enable', '--now', service]
      : action === 'disable'
        ? ['disable', '--now', service]
        : action === 'status'
          ? ['show', service, '--property=ActiveState,SubState,UnitFileState']
          : [action, service]
    const result = await this.control(args)
    if (action === 'start' || action === 'restart') {
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        if (await this.ownsHost() && (await gateway.status()).running) {
          process.stdout.write(`${action === 'start' ? this.messages.backgroundReady : this.messages.serviceChanged}\n`)
          return
        }
        await setTimeout(200)
      }
      throw new Error(this.messages.serviceFailed)
    }
    process.stdout.write(`${result.stdout.trim() || this.messages.serviceChanged}\n`)
  }

  private async ownsHost() {
    try {
      const owner = v.parse(v.object({ pid: v.pipe(v.number(), v.integer(), v.minValue(1)) }), JSON.parse(await readFile(join(this.directory, 'host.lock'), 'utf8')))
      const result = await this.control(['show', service, '--property=MainPID', '--value'])
      return owner.pid === Number(result.stdout.trim())
    }
    catch {
      // Startup has not published a lock until the foreground host owns its directory.
      return false
    }
  }

  private async control(args: string[]) {
    return await execute('systemctl', ['--user', ...args], { env: this.env, timeout: 20_000 }).catch(() => {
      throw new Error(this.messages.serviceFailed)
    })
  }
}
