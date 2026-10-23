import process from 'node:process'

import { parseArgs } from 'node:util'

import { readConfig } from '@angela/host-sdk/config'
import { LocalConfigFile, resolveLocalConfigPath } from '@angela/local-config/node'
import { getGenerationProvider, listProviders } from '@angela/provider-inference'

import { Terminal } from './terminal'

/**
 * Configures the existing shared provider file. Credentials come from the environment or an existing entry, never arguments or echoed input.
 *
 * Call stack:
 * runSetup -> Terminal.ask -> provider registry -> LocalConfigFile.update
 */
export async function runSetup(args: string[], env: NodeJS.ProcessEnv) {
  const { values } = parseArgs({ args, options: {
    'provider': { type: 'string' },
    'definition': { type: 'string' },
    'model': { type: 'string' },
    'base-url': { type: 'string' },
    'api': { type: 'string' },
    'config': { type: 'string' },
    'locale': { type: 'string' },
    'list-providers': { type: 'boolean' },
    'help': { type: 'boolean', short: 'h' },
  } })
  const { messages } = await readConfig(['--help', ...(values.locale ? ['--locale', values.locale] : [])], env)
  if (values.help) {
    process.stdout.write(`${messages.setup.usage}\n${messages.setup.key}\n`)
    return
  }
  if (values['list-providers']) {
    process.stdout.write(`${listProviders().map(provider => provider.id).join('\n')}\n`)
    return
  }
  if (!process.stdin.isTTY && !values.model)
    throw new Error(messages.setup.usage)
  const file = new LocalConfigFile(resolveLocalConfigPath(values.config, env))
  const saved = (await file.read()).config
  let terminal: Terminal | undefined
  if (process.stdin.isTTY) {
    process.stderr.write(`${messages.setup.key}\n`)
    terminal = new Terminal(() => terminal?.close())
  }
  const choose = async (value: string | undefined, label: string, fallback: string) => {
    if (value !== undefined || !terminal)
      return value ?? fallback
    const answer = await terminal.ask(`${label} [${fallback}] > `)
    if (answer === undefined)
      return undefined
    return answer.trim() || fallback
  }
  try {
    const id = await choose(values.provider, messages.provider, saved?.chat.provider || 'cli')
    if (id === undefined)
      return
    if (!/^[a-z\d][\w.-]{0,99}$/iu.test(id) || ['constructor', 'prototype'].includes(id))
      throw new Error(messages.setup.invalid)
    const previous = saved?.providers[id]
    const definitionId = await choose(values.definition, messages.setup.definition, previous?.definitionId ?? 'openai-compatible')
    if (definitionId === undefined)
      return
    const definition = listProviders().find(provider => provider.id === definitionId)
    if (!definition)
      throw new Error(messages.setup.invalid)
    const model = await choose(values.model, messages.model, saved?.chat.provider === id ? saved.chat.model : env.ANGELA_MODEL ?? '')
    if (model === undefined)
      return
    const sameDefinition = previous?.definitionId === definitionId
    const existing = sameDefinition ? previous.config : undefined
    const defaultUrl = typeof existing?.baseUrl === 'string' ? existing.baseUrl : env.ANGELA_BASE_URL ?? ''
    const baseUrl = await choose(values['base-url'], messages.baseUrl, defaultUrl)
    if (baseUrl === undefined)
      return
    let url: URL | undefined
    try {
      if (baseUrl)
        url = new URL(baseUrl)
    }
    catch {
      throw new Error(messages.setup.invalid)
    }
    const api = values.api ?? (sameDefinition ? existing?.api : undefined) ?? env.ANGELA_API ?? 'chat-completions'
    if (!model.trim() || model.length > 200 || (url && (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)) || !['chat-completions', 'responses'].includes(String(api)))
      throw new Error(messages.setup.invalid)
    const config = { ...existing, apiKey: env.ANGELA_API_KEY ?? existing?.apiKey ?? '', ...(baseUrl ? { baseUrl } : {}), api }
    try {
      if (!getGenerationProvider(await definition.createProvider(config)))
        throw new Error(messages.setup.invalid)
    }
    catch {
      throw new Error(messages.setup.invalid)
    }
    await file.update({ providers: { [id]: { definitionId, config, status: 'configured' } }, chat: { provider: id, model: model.trim() } })
    process.stdout.write(`${messages.setup.saved}\n`)
  }
  finally {
    terminal?.close()
  }
}
