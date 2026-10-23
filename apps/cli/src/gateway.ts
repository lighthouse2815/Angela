import type { cliMessages } from '@angela/i18n/cli'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

import { acquireFileLock } from '@angela/companion/file-lock'
import { LocalConfigFile } from '@angela/local-config/node'

import * as v from 'valibot'

const portSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535))
const settingsSchema = v.object({
  version: v.literal(1),
  port: portSchema,
  password: v.pipe(v.string(), v.minLength(32)),
  jwtSecret: v.pipe(v.string(), v.minLength(32)),
})
const keySchema = v.object({ id: v.string(), name: v.string(), key: v.string(), isActive: v.optional(v.boolean()) })
const keysSchema = v.object({ keys: v.array(keySchema) })
const accountSchema = v.object({
  id: v.string(),
  provider: v.string(),
  name: v.optional(v.nullable(v.string())),
  email: v.optional(v.nullable(v.string())),
  isActive: v.boolean(),
  testStatus: v.optional(v.nullable(v.string())),
})
const modelsSchema = v.object({ data: v.array(v.object({ id: v.string() })) })

function hasCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

/**
 * Owns Angela Gateway and its private state. No upstream launcher, tray, updater, or tool configurator runs.
 * Persistent settings belong to this directory. Each start owns one child and one foreground lock until shutdown.
 * Management requests use a file-backed CLI token, not the shared inference key.
 */
export class Gateway {
  constructor(
    readonly directory: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly messages: typeof cliMessages.en.gateway,
    private readonly port?: number,
  ) {
    if (port !== undefined)
      v.parse(portSchema, port)
  }

  private async settings() {
    try {
      return v.parse(settingsSchema, JSON.parse(await readFile(join(this.directory, 'gateway.json'), 'utf8')))
    }
    catch (error) {
      throw new Error(hasCode(error, 'ENOENT') ? this.messages.missing : this.messages.invalid)
    }
  }

  private async token() {
    // NOTICE:
    // The engine authenticates management requests with this file-backed digest.
    // Source: providers/gateway/vendor/src/shared/utils/machineId.js.
    // Keep both ends of this protocol aligned when updating the engine.
    const raw = (await readFile(join(this.directory, 'machine-id'), 'utf8')).trim()
    const secret = (await readFile(join(this.directory, 'auth', 'cli-secret'), 'utf8')).trim()
    if (!raw || !secret)
      throw new Error(this.messages.invalid)
    return createHash('sha256').update(`${raw}9r-cli-auth${secret}`).digest('hex').slice(0, 16)
  }

  async endpoint() {
    const settings = await this.settings()
    return `http://127.0.0.1:${this.port ?? settings.port}`
  }

  private async request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
      const response = await fetch(new URL(path, await this.endpoint()), {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-9r-cli-token': await this.token(),
          ...(path.startsWith('/angela1/') ? { Authorization: `Bearer ${await this.sharedKey()}` } : {}),
        },
        ...(body === undefined ? undefined : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
      })
      if (!response.ok)
        throw new Error(`${this.messages.request} (HTTP ${response.status})`)
      return await response.json()
    }
    catch (error) {
      // Provider responses and request bodies can contain credentials. Only a locally generated HTTP error is printable.
      if (error instanceof Error && error.message.startsWith(`${this.messages.request} (HTTP `))
        throw error
      throw new Error(this.messages.request)
    }
  }

  async status() {
    try {
      await readFile(join(this.directory, 'gateway.json'), 'utf8')
    }
    catch (error) {
      if (hasCode(error, 'ENOENT'))
        return { configured: false, running: false }
      throw error
    }
    const endpoint = await this.endpoint()
    try {
      await this.request('/api/settings')
      return { configured: true, running: true, endpoint: `${endpoint}/angela1`, engine: 'Angela Gateway' }
    }
    catch {
      return { configured: true, running: false, endpoint: `${endpoint}/angela1`, engine: 'Angela Gateway' }
    }
  }

  async accounts() {
    return v.parse(v.object({ connections: v.array(accountSchema) }), await this.request('/api/providers')).connections
  }

  async addAccount(provider: string, name: string, credentials: { apiKey?: string, providerSpecificData?: Record<string, unknown> }) {
    const data = await this.request('/api/providers', 'POST', { provider, name, ...credentials, allowOverwrite: false })
    return v.parse(v.object({ connection: accountSchema }), data).connection
  }

  async setAccountEnabled(id: string, enabled: boolean) {
    await this.request(`/api/providers/${encodeURIComponent(id)}`, 'PUT', { isActive: enabled })
  }

  async testAccount(id: string) {
    const result = v.parse(v.object({ valid: v.boolean(), refreshed: v.optional(v.boolean()) }), await this.request(`/api/providers/${encodeURIComponent(id)}/test`, 'POST'))
    return result
  }

  async keys() {
    return v.parse(keysSchema, await this.request('/api/keys')).keys.map(({ id, name, isActive }) => ({ id, name, isActive }))
  }

  private async sharedKey() {
    const keys = v.parse(keysSchema, await this.request('/api/keys')).keys
    const existing = keys.find(key => key.name === 'angela' && key.isActive !== false)
    if (existing)
      return existing.key
    return v.parse(v.object({ key: v.string() }), await this.request('/api/keys', 'POST', { name: 'angela' })).key
  }

  async showKey() {
    return await this.sharedKey()
  }

  async models() {
    return v.parse(modelsSchema, await this.request('/angela1/models')).data
  }

  /** Updates only Angela's gateway provider and chat selection. Other applications and providers remain unchanged. */
  async use(model: string, configPath: string) {
    const models = await this.models()
    if (!models.some(entry => entry.id === model))
      throw new Error(this.messages.modelMissing)
    const file = new LocalConfigFile(configPath)
    const previous = (await file.read()).config?.providers['angela-gateway']
    if (previous && previous.definitionId !== 'openai-compatible')
      throw new Error(this.messages.conflict)
    await file.update({
      providers: { 'angela-gateway': {
        definitionId: 'openai-compatible',
        status: 'configured',
        config: { apiKey: await this.sharedKey(), baseUrl: `${await this.endpoint()}/angela1/`, api: 'chat-completions' },
      } },
      chat: { provider: 'angela-gateway', model },
    })
  }

  async login(provider?: string) {
    if (provider && !/^[a-z\d][a-z\d-]{0,99}$/u.test(provider))
      throw new Error(this.messages.usage)
    await this.request('/api/settings')
    return `${await this.endpoint()}/dashboard/providers${provider ? `/${provider}` : ''}`
  }

  async password() {
    return (await this.settings()).password
  }

  private async writeSettings(settings: v.InferOutput<typeof settingsSchema>) {
    const temporary = join(this.directory, `gateway.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      await rename(temporary, join(this.directory, 'gateway.json'))
    }
    finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!hasCode(error, 'ENOENT'))
          throw error
      })
    }
  }

  private async prepare() {
    let settings: v.InferOutput<typeof settingsSchema>
    try {
      await readFile(join(this.directory, 'gateway.json'), 'utf8')
      settings = await this.settings()
    }
    catch (error) {
      if (!hasCode(error, 'ENOENT'))
        throw error
      settings = { version: 1, port: 1107, password: randomBytes(32).toString('hex'), jwtSecret: randomBytes(32).toString('hex') }
    }
    settings.port = this.port ?? settings.port
    await this.writeSettings(settings)
    await mkdir(join(this.directory, 'auth'), { recursive: true, mode: 0o700 })
    for (const [path, value] of [
      [join(this.directory, 'machine-id'), randomUUID()],
      [join(this.directory, 'auth', 'cli-secret'), randomBytes(32).toString('hex')],
    ] as const) {
      await writeFile(path, value, { flag: 'wx', mode: 0o600 }).catch((error: unknown) => {
        if (!hasCode(error, 'EEXIST'))
          throw error
      })
    }
    return settings
  }

  /**
   * Runs one foreground engine. Cancellation stops only this child, then releases its directory lock.
   * Startup refuses occupied ports. Readiness requires this directory's management token, not a TCP connection alone.
   *
   * Call stack:
   * runGateway -> Gateway.start -> bundled custom-server.js -> provider routes and token refresh
   */
  async start(signal: AbortSignal, ready: () => void) {
    const entry = join(dirname(createRequire(import.meta.url).resolve('@angela/gateway/package.json')), 'dist', 'custom-server.js')
    if (!(await stat(entry).catch(() => undefined))?.isFile())
      throw new Error(this.messages.buildMissing)
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    const lockPath = join(this.directory, 'host.lock')
    const lock = await acquireFileLock(lockPath, this.messages.locked, true)
    try {
      const settings = await this.prepare()
      const port = settings.port
      // The upstream launcher kills processes on its target port. Angela never invokes that launcher.
      await new Promise<void>((resolve, reject) => {
        const probe = createServer()
        probe.once('error', () => reject(new Error(this.messages.portBusy)))
        probe.listen({ port, host: '127.0.0.1', exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()))
      })
      if (signal.aborted)
        return
      const child = spawn(process.execPath, ['--dns-result-order=ipv4first', entry], {
        cwd: dirname(entry),
        stdio: 'ignore',
        windowsHide: true,
        env: {
          ...this.env,
          DATA_DIR: this.directory,
          PORT: String(port),
          HOSTNAME: '127.0.0.1',
          NODE_ENV: 'production',
          JWT_SECRET: settings.jwtSecret,
          INITIAL_PASSWORD: settings.password,
          NEXT_TELEMETRY_DISABLED: '1',
          ENABLE_REQUEST_LOGS: 'false',
          OBSERVABILITY_ENABLED: 'false',
        },
      })
      let exited = false
      const closed = new Promise<void>((resolve) => {
        child.once('error', () => {
          exited = true
          resolve()
        })
        child.once('close', () => {
          exited = true
          resolve()
        })
      })
      const stop = () => {
        child.kill('SIGTERM')
      }
      // Startup can end before chat installs its signal handlers. An exiting parent must not leave its gateway child behind.
      process.once('exit', stop)
      signal.addEventListener('abort', stop, { once: true })
      try {
        const deadline = Date.now() + 60_000
        let started = false
        while (!signal.aborted && Date.now() < deadline) {
          if (exited)
            break
          try {
            await this.request('/api/settings', 'GET', undefined, signal)
            started = true
            break
          }
          catch {
            if (!signal.aborted && !exited)
              await setTimeout(200)
          }
        }
        if (signal.aborted)
          return
        if (!started || exited)
          throw new Error(this.messages.startFailed)
        await this.request('/api/settings', 'PATCH', { requireLogin: true, requireApiKey: true, enableObservability: false }, signal)
        await this.sharedKey()
        await this.request('/api/gateway/start', 'POST', undefined, signal)
        if (signal.aborted)
          return
        ready()
        await closed
        if (!signal.aborted)
          throw new Error(this.messages.startFailed)
      }
      finally {
        process.off('exit', stop)
        signal.removeEventListener('abort', stop)
        stop()
        const timeout = new AbortController()
        try {
          await Promise.race([closed, setTimeout(5000, undefined, { signal: timeout.signal })])
          if (!exited) {
            child.kill('SIGKILL')
            await closed
          }
        }
        finally {
          timeout.abort()
        }
      }
    }
    finally {
      await lock.close()
      await unlink(lockPath)
    }
  }
}
