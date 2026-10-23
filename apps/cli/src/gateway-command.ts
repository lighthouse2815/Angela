import process from 'node:process'

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { resolveLocalConfigPath } from '@angela/local-config/node'

import * as v from 'valibot'

import { Gateway } from './gateway'

/**
 * Controls the local engine without loading the chat runtime or changing other tools.
 * OAuth and provider-specific imports use the bundled dashboard. Account inspection and API-key setup stay in the terminal.
 *
 * Call stack:
 * main -> runGateway -> Gateway -> bundled Angela Gateway server
 *                    -> LocalConfigFile -> existing Angela inference provider
 */
export async function runGateway(args: string[], env: NodeJS.ProcessEnv) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'port': { type: 'string' },
    'data-dir': { type: 'string' },
    'locale': { type: 'string' },
    'help': { type: 'boolean', short: 'h' },
    'config': { type: 'string' },
    'model': { type: 'string' },
    'provider': { type: 'string' },
    'name': { type: 'string' },
    'credentials-file': { type: 'string' },
    'show': { type: 'boolean' },
  } })
  const locale = v.parse(v.picklist(['en', 'vi']), values.locale ?? env.ANGELA_LOCALE ?? 'vi')
  const messages = cliMessages[locale].gateway
  const action = positionals[0] ?? 'status'
  if (values.help) {
    process.stdout.write(`${messages.usage}\n${messages.scope}\n`)
    return
  }
  const oneArgument = ['login', 'enable', 'disable', 'test'].includes(action)
  if (positionals.length > (oneArgument ? 2 : 1) || !['start', 'status', 'login', 'accounts', 'add', 'enable', 'disable', 'test', 'models', 'keys', 'key', 'password', 'use'].includes(action))
    throw new Error(messages.usage)
  if (['enable', 'disable', 'test'].includes(action) && !positionals[1])
    throw new Error(messages.usage)
  if ((action === 'use' && !values.model) || (action === 'add' && (!values.provider || !values.name)))
    throw new Error(messages.usage)
  const directory = resolve(values['data-dir'] ?? env.ANGELA_GATEWAY_DATA_DIR ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'gateway'))
  const gateway = new Gateway(directory, env, messages, values.port === undefined ? undefined : Number(values.port))
  const print = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  if (action === 'start') {
    const lifetime = new AbortController()
    const stop = () => lifetime.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    process.once('SIGHUP', stop)
    try {
      process.stdout.write(`${messages.starting}\n`)
      await gateway.start(lifetime.signal, () => process.stdout.write(`${messages.ready}\n`))
    }
    finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      process.off('SIGHUP', stop)
    }
    return
  }
  if (action === 'status') {
    print(await gateway.status())
    return
  }
  if (action === 'login') {
    process.stdout.write(`${messages.login}\n${await gateway.login(positionals[1])}\n${messages.passwordHint}\n`)
    return
  }
  if (action === 'accounts') {
    print(await gateway.accounts())
    return
  }
  if (action === 'add') {
    const schema = v.object({ apiKey: v.optional(v.string()), providerSpecificData: v.optional(v.record(v.string(), v.unknown())) })
    let credentials: v.InferOutput<typeof schema> = { apiKey: env.ANGELA_GATEWAY_PROVIDER_KEY }
    if (values['credentials-file']) {
      try {
        credentials = v.parse(schema, JSON.parse(await readFile(resolve(values['credentials-file']), 'utf8')))
      }
      catch {
        throw new Error(messages.credentials)
      }
    }
    print(await gateway.addAccount(values.provider!, values.name!, credentials))
    return
  }
  if (action === 'enable' || action === 'disable') {
    await gateway.setAccountEnabled(positionals[1]!, action === 'enable')
    process.stdout.write(`${messages.updated}\n`)
    return
  }
  if (action === 'test') {
    const result = await gateway.testAccount(positionals[1]!)
    print(result)
    if (!result.valid)
      process.exitCode = 1
    return
  }
  if (action === 'models') {
    print(await gateway.models())
    return
  }
  if (action === 'keys') {
    print(await gateway.keys())
    return
  }
  if (action === 'key' || action === 'password') {
    if (!values.show)
      throw new Error(messages.show)
    process.stdout.write(`${action === 'key' ? await gateway.showKey() : await gateway.password()}\n`)
    return
  }
  await gateway.use(values.model!, resolveLocalConfigPath(values.config, env))
  process.stdout.write(`${messages.saved}\n`)
}
