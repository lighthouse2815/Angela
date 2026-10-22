import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

import { loadCases } from './schema'
import { criteria } from './scoring'

const execute = promisify(execFile)

async function run(args: string[], configPath: string) {
  try {
    const output = await execute(process.execPath, ['--import', 'tsx', 'run.ts', '--config', configPath, ...args], { cwd: import.meta.dirname, env: { ...process.env, ANGELA_API_KEY: '', ANGELA_MODEL: undefined, ANGELA_PROVIDER: undefined, ANGELA_BASE_URL: undefined, ANGELA_API: undefined }, timeout: 20_000 })
    return { code: 0, ...output }
  }
  catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && 'stdout' in error && 'stderr' in error)
      return { code: error.code, stdout: String(error.stdout), stderr: String(error.stderr) }
    throw error
  }
}

it('supports subsets, strict preparation, invalid selection, and immutable output files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-runner-test-'))
  const output = join(directory, 'report.json')
  const config = join(directory, 'unused-config.json')
  try {
    const selected = await run(['--id', 'plan_not_completed_001', '--output', output], config)
    expect(selected.code).toBe(0)
    const report = JSON.parse(await readFile(output, 'utf8'))
    expect(report.summary.total).toBe(1)
    expect(report.summary.prepared).toBe(1)
    expect(report.summary.behaviorPassRate).toBeNull()
    expect((await run(['--category', 'correction', '--strict'], config)).code).toBe(1)
    expect((await run(['--id', 'missing_case'], config)).code).toBe(2)
    expect((await run(['--id', 'plan_not_completed_001', '--output', output], config)).code).toBe(2)
    expect(await readFile(output, 'utf8')).toBe(`${JSON.stringify(report, null, 2)}\n`)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('records live transport answers, valid judgments, and malformed judgments with distinct exits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-live-runner-test-'))
  const item = (await loadCases(new URL('./cases.jsonl', import.meta.url)))[0]!
  let malformed = false
  let judgePassed = true
  let judgeFormat: unknown
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += String(chunk)
    const isJudge = body.includes('judge-policy') || body.includes('frozen rubric')
    if (isJudge)
      judgeFormat = JSON.parse(body).response_format
    const answer = isJudge ? (malformed ? 'not-json' : JSON.stringify({ checks: criteria(item.expected).map(criterion => ({ id: criterion.id, passed: judgePassed, reason: 'Transport fixture judgment', quote: '' })) })) : 'Bạn mới nêu kế hoạch, mình chưa có cập nhật hoàn thành.'
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing test transport port')
    const config = join(directory, 'config.json')
    const flags = ['--live', '--id', item.id, '--model', 'transport-test', '--base-url', `http://127.0.0.1:${address.port}/v1/`, '--api', 'chat-completions', '--strict']
    const unjudged = join(directory, 'unjudged.json')
    expect((await run([...flags, '--no-judge', '--output', unjudged], config)).code).toBe(1)
    expect(JSON.parse(await readFile(unjudged, 'utf8')).summary.unjudged).toBe(1)
    const judged = join(directory, 'judged.json')
    expect((await run([...flags, '--output', judged], config)).code).toBe(0)
    expect(JSON.parse(await readFile(judged, 'utf8')).summary.completePassed).toBe(1)
    expect(judgeFormat).toMatchObject({ type: 'json_schema', json_schema: { strict: true, schema: { type: 'object', required: ['checks'] } } })
    judgePassed = false
    const failed = join(directory, 'failed.json')
    expect((await run([...flags, '--output', failed], config)).code).toBe(1)
    expect(JSON.parse(await readFile(failed, 'utf8')).summary.behaviorFailed).toBe(1)
    malformed = true
    const invalid = join(directory, 'invalid.json')
    expect((await run([...flags, '--output', invalid], config)).code).toBe(2)
    const report = JSON.parse(await readFile(invalid, 'utf8'))
    expect(report.summary.evaluated).toBe(0)
    expect(report.summary.infrastructureFailures).toBe(1)
    expect(report.results[0].judge.raw).toBe('not-json')
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
