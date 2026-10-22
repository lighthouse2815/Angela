import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it } from 'vitest'

it('prints a failure report after a provider retry deadline instead of exiting successfully without output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-evaluation-command-'))
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '30' })
    response.end(JSON.stringify({ error: { message: 'private-fixture-provider-body' } }))
  })
  let child: ReturnType<typeof spawn> | undefined
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture port')
    child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx')), fileURLToPath(new URL('./bin/run.ts', import.meta.url)), 'eval', '--case', 'tool-selection', '--timeout-ms', '1000', '--json'], {
      env: { ...process.env, ANGELA_MODEL: 'fixture-model', ANGELA_PROVIDER: '', ANGELA_API_KEY: '', ANGELA_API: 'chat-completions', ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/`, ANGELA_CONFIG: join(directory, 'config.json'), ANGELA_LOCALE: 'en' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => stdout += String(chunk))
    child.stderr?.on('data', chunk => stderr += String(chunk))
    const [code] = await once(child, 'close')
    expect(code).toBe(1)
    expect(JSON.parse(stdout)).toMatchObject({ model: 'fixture-model', passed: false, results: [{ id: 'tool-selection', checks: { generation_completed: false } }] })
    expect(stdout + stderr).not.toContain('private-fixture-provider-body')
    expect(stderr).not.toContain(cliMessages.en.mcpConnected)
  }
  finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close')
      child.kill('SIGKILL')
      await closed
    }
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)
