import { parseArgs } from 'node:util'

import { cliMessages } from '@proj-airi/i18n/cli'

import * as v from 'valibot'

/** Arguments override environment configuration. Credentials only come from the environment. */
export function readConfig(args: string[], env: NodeJS.ProcessEnv) {
  const { values } = parseArgs({
    args,
    options: {
      'model': { type: 'string' },
      'base-url': { type: 'string' },
      'api': { type: 'string' },
      'prompt': { type: 'string', short: 'p' },
      'cwd': { type: 'string' },
      'locale': { type: 'string' },
      'help': { type: 'boolean', short: 'h' },
      'computer-use': { type: 'boolean' },
      'mcp-command': { type: 'string' },
      'mcp-arg': { type: 'string', multiple: true },
    },
  })
  const locale = v.parse(v.picklist(['en', 'vi'], cliMessages.en.invalidLocale), values.locale ?? env.ANGELA_LOCALE ?? 'vi')
  const messages = cliMessages[locale]
  if (values.help)
    return { help: true as const, messages }

  const model = v.parse(v.pipe(v.string(), v.trim(), v.nonEmpty(messages.missingModel)), values.model ?? env.ANGELA_MODEL ?? '')
  const baseUrl = v.parse(v.pipe(v.string(), v.url(messages.invalidUrl)), values['base-url'] ?? env.ANGELA_BASE_URL ?? 'https://api.openai.com/v1/')
  if (!['http:', 'https:'].includes(new URL(baseUrl).protocol))
    throw new Error(messages.invalidUrl)
  const api = v.parse(v.picklist(['chat-completions', 'responses'], messages.invalidApi), values.api ?? env.ANGELA_API ?? 'chat-completions')
  if (values['computer-use'] && values['mcp-command'])
    throw new Error(messages.conflictingMcp)
  if (values['mcp-arg'] && !values['mcp-command'])
    throw new Error(messages.missingMcpCommand)
  return {
    help: false as const,
    model,
    baseUrl,
    api,
    apiKey: env.ANGELA_API_KEY ?? '',
    prompt: values.prompt,
    cwd: values.cwd,
    computerUse: values['computer-use'] ?? false,
    mcpCommand: values['mcp-command'],
    mcpArgs: values['mcp-arg'] ?? [],
    messages,
  }
}
