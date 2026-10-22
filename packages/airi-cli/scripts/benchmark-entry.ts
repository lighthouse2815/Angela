import process from 'node:process'

import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Measures the actual CLI entry point with piped text, default MCP, and deterministic HTTP model output. */
const directory = await mkdtemp(join(tmpdir(), 'angela-entry-benchmark-'))
const server = createServer(async (request, response) => {
  for await (const _chunk of request) { /* Drain the request without retaining the prompt. */ }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'A bounded benchmark answer.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
})
try {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing benchmark HTTP port')
  const entry = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../src/bin/run.ts', import.meta.url))
  const child = fork(entry, [], {
    execArgv: ['--expose-gc', '--import', 'tsx', '--import', fileURLToPath(new URL('./memory-probe.mjs', import.meta.url))],
    stdio: ['pipe', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, TMPDIR: directory, ANGELA_CONFIG: join(directory, 'config.json'), ANGELA_DATA_DIR: directory, ANGELA_API: 'chat-completions', ANGELA_MODEL: 'benchmark', ANGELA_API_KEY: '', ANGELA_BASE_URL: `http://127.0.0.1:${address.port}/v1/`, ANGELA_EMBEDDING_MODEL: undefined },
  })
  const samples: unknown[] = []
  let failure = ''
  child.stderr?.on('data', (chunk) => {
    failure = (failure + String(chunk)).slice(-2000)
  })
  child.on('message', (message) => {
    samples.push(message)
    if (samples.length === 1)
      child.stdin?.end('Hello Angela')
  })
  const timeout = setTimeout(() => child.kill('SIGTERM'), 30_000)
  try {
    const [code] = await once(child, 'exit')
    if (code !== 0 || samples.length !== 2)
      throw new Error(`CLI benchmark failed: ${failure}`)
    process.stdout.write(`${JSON.stringify({ node: process.version, samples }, null, 2)}\n`)
  }
  finally {
    clearTimeout(timeout)
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM')
  }
}
finally {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await rm(directory, { recursive: true, force: true })
}
