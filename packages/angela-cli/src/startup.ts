import process from 'node:process'

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs, stripVTControlCharacters } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { resolveLocalConfigPath } from '@angela/local-config/node'
import { errorMessageFrom } from '@moeru/std'

import * as v from 'valibot'

import { readConfig } from './config'
import { Gateway } from './gateway'
import { Terminal } from './terminal'

/**
 * Owns interactive provider selection and any gateway child that it starts.
 * Saved accounts survive exit. A previously running gateway belongs to its original host and remains untouched.
 *
 * Call stack:
 * main -> Startup.open -> Terminal -> Gateway -> local provider dashboard
 *                     -> Gateway.use -> LocalConfigFile -> runChat
 * main -> Startup.close -> owned gateway child shutdown
 */
export class Startup {
  private messages = cliMessages.vi
  private terminal?: Terminal
  private readonly lifetime = new AbortController()
  private host?: Promise<void>
  private hostError?: unknown
  private readonly stop = () => {
    this.lifetime.abort()
    this.terminal?.close()
  }

  /** Skips non-chat actions and explicit provider configuration unless the caller requests --menu. */
  async open(args: string[], env: NodeJS.ProcessEnv) {
    // Use the chat parser first so invalid flags fail before any gateway or terminal side effects.
    this.messages = (await readConfig([...args, '--help'], env)).messages
    const { values } = parseArgs({ args, strict: false, allowPositionals: true, allowNegative: true, options: {
      'menu': { type: 'boolean' },
      'help': { type: 'boolean', short: 'h' },
      'prompt': { type: 'string', short: 'p' },
      'list-sessions': { type: 'boolean' },
      'config': { type: 'string' },
      'provider': { type: 'string' },
      'model': { type: 'string' },
      'base-url': { type: 'string' },
      'api': { type: 'string' },
    } })
    if (values.help || values.prompt !== undefined || values['list-sessions'] || values.menu === false)
      return { args, env }
    if (!values.menu && [values.provider, values.model, values['base-url'], values.api].some(value => value !== undefined))
      return { args, env }

    const messages = this.messages.startup
    const gateway = new Gateway(resolve(env.ANGELA_GATEWAY_DATA_DIR ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'gateway')), env, this.messages.gateway)
    const configPath = resolveLocalConfigPath(v.parse(v.optional(v.string()), values.config), env)
    this.terminal = new Terminal(this.stop)
    process.once('SIGINT', this.stop)
    process.once('SIGTERM', this.stop)
    process.once('SIGHUP', this.stop)
    try {
      while (!this.lifetime.signal.aborted) {
        const choice = await this.choose(messages.title, [messages.gpt, messages.gemini, messages.claude, messages.custom, messages.current, messages.exit])
        if (choice === undefined || choice === 5)
          return
        try {
          if (choice === 4) {
            const current = await readConfig(args, env)
            if (!current.help && !current.list && current.baseUrl?.startsWith('http://127.0.0.1:')) {
              const status = await gateway.status()
              if (status.configured && current.baseUrl === `${status.endpoint}/`)
                await this.ensureHost(gateway)
            }
            return this.lifetime.signal.aborted ? undefined : { args, env }
          }
          if (!await this.ensureHost(gateway))
            return
          let model: string | undefined
          if (choice === 3) {
            model = await this.custom(gateway)
          }
          else {
            const provider = ['codex', 'gemini-cli', 'claude'][choice]!
            if (await this.login(gateway, provider))
              model = await this.models(gateway, ['cx/', 'gc/', 'cc/'][choice])
          }
          if (!model)
            continue
          await gateway.use(model, configPath)
          await this.terminal.notify(messages.saved)
          if (this.lifetime.signal.aborted)
            return
          // An explicit menu choice outranks stale provider environment values for this session only.
          // Other environment values and the caller's process.env remain unchanged.
          return {
            args: [...args, '--provider', 'angela-gateway', '--model', model, '--base-url', `${await gateway.endpoint()}/v1/`, '--api', 'chat-completions'],
            env: { ...env, ANGELA_API_KEY: undefined },
          }
        }
        catch (error) {
          if (!this.lifetime.signal.aborted)
            await this.failure(error)
        }
      }
    }
    finally {
      this.terminal.close()
      process.off('SIGINT', this.stop)
    }
  }

  private async choose(title: string, entries: string[]) {
    await this.terminal?.notify(`${title}\n${entries.map((label, index) => `${index + 1}. ${stripVTControlCharacters(label).replace(/[\r\n]/gu, ' ')}`).join('\n')}`)
    while (!this.lifetime.signal.aborted) {
      const answer = await this.terminal?.ask(this.messages.startup.choice)
      if (answer === undefined)
        return
      const number = Number(answer.trim())
      if (Number.isInteger(number) && number >= 1 && number <= entries.length)
        return number - 1
      await this.terminal?.notify(this.messages.startup.invalid)
    }
  }

  private async ensureHost(gateway: Gateway) {
    if (this.hostError)
      throw this.hostError
    if ((await gateway.status()).running)
      return true
    if (!this.host) {
      await this.terminal?.notify(this.messages.gateway.starting)
      const started = Promise.withResolvers<void>()
      this.host = gateway.start(this.lifetime.signal, started.resolve).catch((error: unknown) => {
        this.hostError = error
      })
      await Promise.race([started.promise, this.host])
      if (this.hostError)
        throw this.hostError
      if (this.lifetime.signal.aborted)
        return false
      await this.terminal?.notify(this.messages.startup.active)
    }
    return true
  }

  private async login(gateway: Gateway, provider?: string) {
    await this.terminal?.notify(`${this.messages.startup.browser}\n${await gateway.login(provider)}\n${this.messages.gateway.passwordHint}`)
    while (!this.lifetime.signal.aborted) {
      const answer = await this.terminal?.ask(this.messages.startup.connected)
      if (answer === undefined || answer.trim().toLowerCase() === 'b')
        return false
      if (answer.trim().toLowerCase() === 'p') {
        await this.terminal?.notify(await gateway.password())
        continue
      }
      return true
    }
    return false
  }

  private async models(gateway: Gateway, prefix?: string) {
    const accounts = await gateway.accounts()
    if (!accounts.some(account => account.isActive)) {
      await this.terminal?.notify(this.messages.startup.empty)
      return
    }
    const filter = await this.terminal?.ask(this.messages.startup.filter)
    if (filter === undefined || filter.trim().toLowerCase() === 'b')
      return
    const models = (await gateway.models()).filter(model => (!prefix || model.id.startsWith(prefix)) && model.id.toLowerCase().includes(filter.trim().toLowerCase()))
    if (!models.length) {
      await this.terminal?.notify(this.messages.startup.empty)
      return
    }
    let page = 0
    while (!this.lifetime.signal.aborted) {
      const visible = models.slice(page * 15, (page + 1) * 15)
      const choice = await this.choose(this.messages.startup.models, [...visible.map(model => model.id), this.messages.startup.next, this.messages.startup.previous, this.messages.startup.back])
      if (choice === undefined || choice === visible.length + 2)
        return
      if (choice < visible.length)
        return visible[choice]!.id
      page = choice === visible.length ? (page + 1) % Math.ceil(models.length / 15) : (page - 1 + Math.ceil(models.length / 15)) % Math.ceil(models.length / 15)
    }
  }

  private async accounts(gateway: Gateway) {
    const messages = this.messages.startup
    const accounts = await gateway.accounts()
    if (!accounts.length) {
      await this.terminal?.notify(messages.empty)
      return
    }
    const choice = await this.choose(messages.accounts, [...accounts.map(account => `${account.provider} · ${account.name ?? account.email ?? account.id} · ${account.isActive ? messages.enabled : messages.disabled}`), messages.back])
    if (choice === undefined || choice === accounts.length)
      return
    const account = accounts[choice]!
    const action = await this.choose(account.provider, [messages.test, account.isActive ? messages.disable : messages.enable, messages.back])
    if (action === 0)
      await this.terminal?.notify(JSON.stringify(await gateway.testAccount(account.id)))
    if (action === 1) {
      await gateway.setAccountEnabled(account.id, !account.isActive)
      await this.terminal?.notify(this.messages.gateway.updated)
    }
  }

  private async custom(gateway: Gateway): Promise<string | undefined> {
    const messages = this.messages.startup
    while (!this.lifetime.signal.aborted) {
      const choice = await this.choose(messages.custom, [messages.login, messages.accounts, messages.models, messages.keys, messages.showKey, messages.password, messages.dashboard, messages.back])
      if (choice === undefined || choice === 7)
        return
      try {
        if (choice === 0)
          await this.login(gateway)
        if (choice === 1)
          await this.accounts(gateway)
        if (choice === 2) {
          const model = await this.models(gateway)
          if (model)
            return model
        }
        if (choice === 3)
          await this.terminal?.notify(`${messages.endpoint}: ${await gateway.endpoint()}/v1/\n${JSON.stringify(await gateway.keys(), null, 2)}`)
        if (choice === 4)
          await this.terminal?.notify(await gateway.showKey())
        if (choice === 5)
          await this.terminal?.notify(await gateway.password())
        if (choice === 6)
          await this.terminal?.notify(`${messages.browser}\n${await gateway.endpoint()}/dashboard\n${this.messages.gateway.passwordHint}`)
      }
      catch (error) {
        if (!this.lifetime.signal.aborted)
          await this.failure(error)
      }
    }
  }

  private async failure(error: unknown) {
    const message = errorMessageFrom(error)
    // Only known local errors are printable. Provider errors can contain credentials.
    await this.terminal?.notify(message && Object.values(this.messages.gateway).includes(message) ? message : this.messages.startup.failed)
  }

  /** Stops only the gateway started by this menu, after chat releases its own runtime resources. */
  async close() {
    this.stop()
    await this.host
    process.off('SIGTERM', this.stop)
    process.off('SIGHUP', this.stop)
  }
}
