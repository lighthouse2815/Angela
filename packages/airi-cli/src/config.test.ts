import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LocalConfigFile } from '@proj-airi/local-config/node'
import { describe, expect, it } from 'vitest'

import { readConfig } from './config'

const missing = join(tmpdir(), `angela-config-missing-${randomUUID()}.json`)
const read = (args: string[], env: NodeJS.ProcessEnv = {}) => readConfig(args, { ANGELA_CONFIG: missing, ...env })

describe('cLI configuration', () => {
  it('shows help without credentials or a model', async () => {
    await expect(read(['--help'])).resolves.toMatchObject({ help: true })
  })

  it('takes flags before environment configuration and keeps credentials out of arguments', async () => {
    expect(await read(['--model', 'selected', '--locale', 'en'], {
      ANGELA_MODEL: 'other',
      ANGELA_BASE_URL: 'http://localhost:1234/v1/',
      ANGELA_API_KEY: 'test-only',
    })).toMatchObject({ model: 'selected', baseUrl: 'http://localhost:1234/v1/', apiKey: 'test-only' })
    await expect(read(['--api-key', 'test-only'])).rejects.toThrow()
  })

  it('rejects missing models and invalid endpoints or protocols before network access', async () => {
    await expect(read([])).rejects.toThrow('ANGELA_MODEL')
    await expect(read(['--model', 'm', '--base-url', 'file:///tmp/provider'])).rejects.toThrow('HTTP')
    await expect(read(['--model', 'm', '--api', 'invalid'])).rejects.toThrow('responses')
  })

  it('keeps server arguments as an argv array and rejects conflicting servers', async () => {
    expect(await read(['--model', 'm', '--mcp-command', 'node', '--mcp-arg=server.mjs', '--mcp-arg=a b'])).toMatchObject({ mcpCommand: 'node', mcpArgs: ['server.mjs', 'a b'] })
    await expect(read(['--model', 'm', '--computer-use', '--mcp-command', 'node'])).rejects.toThrow('--computer-use')
    await expect(read(['--model', 'm', '--mcp-arg=test'])).rejects.toThrow('--mcp-command')
  })

  it('uses the shared provider and model without environment credentials, with temporary overrides', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angela-cli-config-'))
    const path = join(directory, 'config.json')
    const store = new LocalConfigFile(path)
    const snapshot = await store.update({
      providers: { google: { definitionId: 'google-generative-ai', status: 'configured', config: { apiKey: 'test-only-key', baseUrl: 'https://provider.example/v1/' } } },
      chat: { provider: 'google', model: 'chosen-model' },
    })
    try {
      expect(await read([], { ANGELA_CONFIG: path })).toMatchObject({ definitionId: 'google-generative-ai', model: 'chosen-model', apiKey: 'test-only-key' })
      expect(await read(['--config', path, '--model', 'override'], { ANGELA_API_KEY: 'temporary-key' })).toMatchObject({ model: 'override', apiKey: 'temporary-key' })
      expect(await store.read()).toEqual(snapshot)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
