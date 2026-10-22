import type { cliMessages } from '@angela/i18n/cli'

import process from 'node:process'

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { cliMessages as translations } from '@angela/i18n/cli'
import { getGenerationProvider, listProviders } from '@angela/provider-inference'

import * as v from 'valibot'

import { LocalZaloCredentialStore } from './adapters/zalo/zalo-credential-store'
import { AwayModeService } from './away/away-mode-service'
import { LocalAwayModeStore } from './away/away-mode-store'
import { readConfig } from './config'

function options(args: string[], env: NodeJS.ProcessEnv) {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    'data-dir': { type: 'string' },
    'locale': { type: 'string' },
    'help': { type: 'boolean', short: 'h' },
    'model': { type: 'string' },
    'provider': { type: 'string' },
    'config': { type: 'string' },
    'base-url': { type: 'string' },
    'api': { type: 'string' },
    'cwd': { type: 'string' },
  } })
  const locale = v.parse(v.picklist(['en', 'vi']), parsed.values.locale ?? env.ANGELA_LOCALE ?? 'vi')
  const dataDir = resolve(parsed.values['data-dir'] ?? env.ANGELA_DATA_DIR ?? join(homedir(), '.angela', 'sessions'))
  return { ...parsed, dataDir, messages: translations[locale] }
}

/** Resolves owner commands against account-scoped state without restoring the Zalo connection or loading a model. */
export async function ownerAwayCommand(text: string, dataDir: string, messages: typeof cliMessages.en) {
  const root = join(dataDir, 'zalo')
  const saved = await new LocalZaloCredentialStore(root, () => {}).load()
  if (!saved)
    return messages.away.missing
  return await new AwayModeService(new LocalAwayModeStore(root, saved.accountId), messages.away, () => {}).command(text)
}

/**
 * Runs owner commands and the foreground Zalo transport host.
 *
 * Call stack:
 * main -> runZalo -> ZaloAdapter -> AwayModeService -> RuntimeSession.send
 */
export async function runZalo(args: string[], env: NodeJS.ProcessEnv, awayCommand = false) {
  const config = options(args, env)
  const { messages } = config
  const action = config.positionals[0]
  if (config.values.help || !action) {
    process.stdout.write(`${messages.away.usage}\n`)
    return
  }
  if (awayCommand || ['allow', 'deny', 'allowed'].includes(action)) {
    const text = `/${awayCommand ? 'away' : 'zalo'} ${config.positionals.join(' ')}`
    process.stdout.write(`${await ownerAwayCommand(text, config.dataDir, messages) ?? messages.away.invalid}\n`)
    return
  }
  const root = join(config.dataDir, 'zalo')
  const credentials = new LocalZaloCredentialStore(root, path => process.stdout.write(`${messages.away.qrFile}: ${JSON.stringify(path)}\n`))
  if (action === 'status') {
    const saved = await credentials.load()
    process.stdout.write(`${JSON.stringify({ savedSession: Boolean(saved), accountId: saved?.accountId, connection: 'not-probed', away: saved ? await new LocalAwayModeStore(root, saved.accountId).state() : undefined })}\n`)
    return
  }
  if (!['login', 'logout', 'run'].includes(action) || config.positionals.length !== 1)
    throw new Error(messages.away.invalid)
  const release = await credentials.acquireHost()
  const lifetime = new AbortController()
  const stop = () => lifetime.abort()
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    if (action === 'logout') {
      await credentials.clear()
      process.stdout.write(`${messages.away.logout}\n`)
      return
    }
    const { PersonalZaloClient } = await import('./adapters/zalo/zalo-client')
    const client = new PersonalZaloClient(credentials)
    if (action === 'login') {
      process.stdout.write(`${messages.away.login}\n`)
      const accountId = await client.login(credentials, (event) => {
        if (event === 'qr_scanned')
          process.stdout.write(`${messages.away.scanned}\n`)
        if (event === 'qr_expired')
          process.stdout.write(`${messages.away.qrExpired}\n`)
      }, AbortSignal.any([lifetime.signal, AbortSignal.timeout(180_000)]))
      process.stdout.write(`${messages.away.connected}: ${accountId}\n`)
      return
    }
    const saved = await credentials.load()
    if (!saved)
      throw new Error(messages.away.missing)
    const providerConfig = await readConfig(args.slice(1), env)
    if (providerConfig.help || providerConfig.list)
      throw new Error(messages.away.invalid)
    const definition = listProviders().find(provider => provider.id === providerConfig.definitionId)
    const provider = definition && getGenerationProvider(await definition.createProvider(providerConfig.providerConfig))
    if (!provider)
      throw new Error(messages.away.failure)
    const { AngelaRuntime } = await import('./runtime/runtime')
    const { AwayRuntimeResponder } = await import('./away/away-runtime-responder')
    const { ZaloAdapter } = await import('./adapters/zalo/zalo-adapter')
    const log = (event: string, fields?: { messageId?: string, reason?: string }) => {
      process.stderr.write(`${JSON.stringify({ channel: 'zalo', event, ...fields })}\n`)
    }
    const runtime = new AngelaRuntime(providerConfig.model, provider, messages, env, providerConfig)
    const service = new AwayModeService(new LocalAwayModeStore(root, saved.accountId), messages.away, log, new AwayRuntimeResponder(runtime, config.dataDir))
    const adapter = new ZaloAdapter(client, service, saved.accountId, log)
    const input = createInterface({ input: process.stdin, terminal: false })
    let commands = Promise.resolve()
    input.on('line', (text) => {
      commands = commands.then(async () => {
        process.stdout.write(`${await service.command(text) ?? messages.away.invalid}\n`)
      }).catch(() => { process.stderr.write(`${messages.away.failure}\n`) })
    })
    try {
      await adapter.start()
      process.stdout.write(`${messages.away.running}\n`)
      if (!lifetime.signal.aborted)
        await new Promise<void>(resolve => lifetime.signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    finally {
      input.close()
      await adapter.close()
      await commands
      await runtime.close()
    }
  }
  catch {
    throw new Error(messages.away.failure)
  }
  finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    await release()
  }
}
