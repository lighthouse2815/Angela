import type { GenerationProvider } from '@proj-airi/provider-inference'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const source = process.env.ANGELA_BENCH_SOURCE ?? join(import.meta.dirname, '../src')
const started = performance.now()
const { AngelaRuntime }: typeof import('../src/runtime/runtime') = await import(pathToFileURL(join(source, 'runtime/runtime.ts')).href)
const runtimeImportMs = performance.now() - started
const { Chat }: typeof import('../src/chat') = await import(pathToFileURL(join(source, 'chat.ts')).href)
const { cliMessages } = await import('@proj-airi/i18n/cli')
const directory = await mkdtemp(join(tmpdir(), 'angela-startup-'))
const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://fixture.invalid/v1/', fetch: async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Understood.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) } }) }
const runtime = new AngelaRuntime('fixture', provider, cliMessages.en)
try {
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'telegram' })
  const chat = new Chat('fixture', provider, directory)
  const latencies: number[] = []
  const firstTextLatencies: number[] = []
  for (let i = 0; i < 11; i++) {
    const request = performance.now()
    let firstText: number | undefined
    await scope.send(chat, `Choose SQLite for companion memory request ${i}`, {
      onStreamEvent: (event) => {
        if (event.type === 'text-delta' && firstText === undefined)
          firstText = performance.now() - request
      },
    })
    latencies.push(performance.now() - request)
    if (firstText === undefined)
      throw new Error('The startup fixture returned no text')
    firstTextLatencies.push(firstText)
  }
  const firstRequestMs = latencies.shift()
  const firstTextMs = firstTextLatencies.shift()
  latencies.sort((a, b) => a - b)
  firstTextLatencies.sort((a, b) => a - b)
  await scope.close()
  await runtime.close()
  const report = { node: process.version, runtimeImportMs, firstRequestMs, firstTextMs, warmRequestMs: { p50: latencies[5], p95: latencies[9] }, warmFirstTextMs: { p50: firstTextLatencies[5], p95: firstTextLatencies[9] }, resourcesAfterClose: runtime.resourceCounts }
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (process.argv[2])
    await writeFile(process.argv[2], output)
  process.stdout.write(output)
}
finally {
  await runtime.close()
  await rm(directory, { recursive: true, force: true })
}
