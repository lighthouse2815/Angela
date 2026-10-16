#!/usr/bin/env node

import process from 'node:process'

import { realpath } from 'node:fs/promises'

import { errorMessageFrom } from '@moeru/std'
import { getDefinedProvider, getGenerationProvider } from '@proj-airi/provider-inference'

import { Chat } from '../chat'
import { readConfig } from '../config'
import { Terminal } from '../terminal'

/**
 * Runs terminal chat and owns input, signals, and provider configuration.
 *
 * Call stack:
 * main -> readConfig -> Chat.send -> core-agent.streamFrom
 */
async function main() {
  const config = readConfig(process.argv.slice(2), process.env)
  const messages = config.messages
  if (config.help) {
    process.stdout.write(`${messages.description}\n\nangela [--model ID] [--prompt TEXT]\n\n${[
      ['--model', messages.model],
      ['--base-url', messages.baseUrl],
      ['--api', messages.protocol],
      ['--prompt, -p', messages.prompt],
      ['--cwd', messages.cwd],
      ['--locale', messages.locale],
      ['--help, -h', messages.help],
    ].map(([flag, text]) => `  ${flag.padEnd(16)}${text}`).join('\n')}\n`)
    return
  }

  const workspace = await realpath(config.cwd ?? process.cwd())
  const definition = getDefinedProvider('openai-compatible')!
  const provider = getGenerationProvider(await definition.createProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, api: config.api }))!
  const chat = new Chat(config.model, provider, workspace)
  const interactive = process.stdin.isTTY && config.prompt === undefined
  let input: Terminal | undefined
  let active: AbortController | undefined
  const interrupt = () => {
    if (active)
      active.abort()
    else
      input?.close()
  }
  process.on('SIGINT', interrupt)
  if (interactive)
    input = new Terminal(interrupt)

  async function send(text: string) {
    active = new AbortController()
    try {
      await chat.send(text, {
        abortSignal: active.signal,
        onStreamEvent(event) {
          if (event.type === 'text-delta')
            process.stdout.write(event.text)
          if (event.type === 'error')
            throw event.error
        },
      })
      process.stdout.write('\n')
    }
    catch (error) {
      process.stderr.write(`\n${active.signal.aborted ? messages.interrupted : `${messages.failed}: ${errorMessageFrom(error) ?? String(error)}`}\n`)
      if (!interactive)
        process.exitCode = active.signal.aborted ? 130 : 1
    }
    finally {
      active = undefined
    }
  }

  try {
    if (input) {
      process.stderr.write(`${messages.workspace}: ${workspace}\n${messages.welcome}\n`)
      while (true) {
        const text = (await input.ask('> '))?.trim()
        if (text === undefined || text === '/exit')
          break
        if (text)
          await send(text)
      }
    }
    else {
      let text = config.prompt ?? ''
      if (config.prompt === undefined) {
        process.stdin.setEncoding('utf8')
        for await (const chunk of process.stdin)
          text += chunk
      }
      if (!text.trim())
        throw new Error(messages.emptyInput)
      await send(text)
    }
  }
  finally {
    input?.close()
    process.off('SIGINT', interrupt)
  }
}

void main().catch((error) => {
  process.stderr.write(`${errorMessageFrom(error) ?? String(error)}\n`)
  process.exitCode = 1
})
