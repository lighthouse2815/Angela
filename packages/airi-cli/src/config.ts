import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { cliMessages } from '@proj-airi/i18n/cli'
import { LocalConfigFile, resolveLocalConfigPath } from '@proj-airi/local-config/node'

import * as v from 'valibot'

/** Flags override environment values, then shared file values, then provider defaults. Overrides never change the file. */
export async function readConfig(args: string[], env: NodeJS.ProcessEnv) {
  const { values } = parseArgs({
    args,
    options: {
      'model': { type: 'string' },
      'provider': { type: 'string' },
      'config': { type: 'string' },
      'base-url': { type: 'string' },
      'api': { type: 'string' },
      'prompt': { type: 'string', short: 'p' },
      'cwd': { type: 'string' },
      'locale': { type: 'string' },
      'help': { type: 'boolean', short: 'h' },
      'computer-use': { type: 'boolean' },
      'mcp-command': { type: 'string' },
      'mcp-arg': { type: 'string', multiple: true },
      'resume': { type: 'string' },
      'list-sessions': { type: 'boolean' },
      'data-dir': { type: 'string' },
    },
  })
  const locale = v.parse(v.picklist(['en', 'vi'], cliMessages.en.invalidLocale), values.locale ?? env.ANGELA_LOCALE ?? 'vi')
  const messages = cliMessages[locale]
  if (values.help)
    return { help: true as const, messages }

  const dataDir = resolve(values['data-dir'] ?? env.ANGELA_DATA_DIR ?? join(homedir(), '.angela', 'sessions'))
  if (values['list-sessions'])
    return { help: false as const, list: true as const, messages, dataDir }
  const resume = values.resume === undefined ? undefined : v.parse(v.pipe(v.string(), v.uuid(messages.invalidId)), values.resume)

  const configPath = resolveLocalConfigPath(values.config, env)
  const saved = (await new LocalConfigFile(configPath).read()).config
  const providerId = values.provider ?? env.ANGELA_PROVIDER ?? saved?.chat.provider
  const selected = providerId ? saved?.providers[providerId] : undefined
  if (providerId && !selected)
    throw new Error(`${messages.unknownProvider}: ${providerId}`)
  const definitionId = selected?.definitionId ?? 'openai-compatible'
  const savedModel = providerId === saved?.chat.provider ? saved?.chat.model : undefined
  const model = v.parse(v.pipe(v.string(), v.trim(), v.nonEmpty(messages.missingModel)), values.model ?? env.ANGELA_MODEL ?? savedModel ?? '')
  const baseUrl = v.parse(v.optional(v.pipe(v.string(), v.url(messages.invalidUrl))), values['base-url'] ?? env.ANGELA_BASE_URL ?? selected?.config.baseUrl ?? (definitionId === 'openai-compatible' ? 'https://api.openai.com/v1/' : undefined))
  if (baseUrl && !['http:', 'https:'].includes(new URL(baseUrl).protocol))
    throw new Error(messages.invalidUrl)
  const api = v.parse(v.optional(v.picklist(['chat-completions', 'responses'], messages.invalidApi)), values.api ?? env.ANGELA_API ?? selected?.config.api ?? (definitionId === 'openai-compatible' ? 'chat-completions' : undefined))
  const apiKey = v.parse(v.string(), env.ANGELA_API_KEY ?? selected?.config.apiKey ?? '')
  const providerConfig = { ...selected?.config, apiKey, ...(baseUrl === undefined ? {} : { baseUrl }), ...(api === undefined ? {} : { api }) }
  if (values['computer-use'] && values['mcp-command'])
    throw new Error(messages.conflictingMcp)
  if (values['mcp-arg'] && !values['mcp-command'])
    throw new Error(messages.missingMcpCommand)
  return {
    help: false as const,
    list: false as const,
    dataDir,
    resume,
    configPath,
    definitionId,
    providerConfig,
    model,
    baseUrl,
    api,
    apiKey,
    prompt: values.prompt,
    cwd: values.cwd,
    computerUse: values['computer-use'] ?? !values['mcp-command'],
    mcpCommand: values['mcp-command'],
    mcpArgs: values['mcp-arg'] ?? [],
    messages,
  }
}
