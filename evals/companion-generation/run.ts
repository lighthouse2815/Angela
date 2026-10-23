import type { Result } from './scoring'

import process from 'node:process'

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { readConfig } from '@angela/host-sdk/config'
import { getGenerationProvider, listProviders } from '@angela/provider-inference'
import { errorMessageFrom } from '@moeru/std'

import * as v from 'valibot'

import { observe } from './harness'
import { loadCases } from './schema'
import { deterministicChecks, judge, judgePrompt, resultSchema, summarize } from './scoring'

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

/**
 * Prepares requests without network access by default. Live runs use the existing CLI provider registry and config precedence.
 *
 * Call stack:
 * main -> loadCases -> observe -> RuntimeSession.send -> Chat -> core-agent/provider
 *   -> deterministicChecks / judge -> summarize -> checkpoint report
 */
async function main() {
  const { values } = parseArgs({ allowNegative: true, options: {
    'live': { type: 'boolean', default: false },
    'judge': { type: 'boolean', default: true },
    'judge-model': { type: 'string' },
    'dataset': { type: 'string' },
    'output': { type: 'string' },
    'resume': { type: 'string' },
    'concurrency': { type: 'string', default: '1' },
    'id': { type: 'string' },
    'category': { type: 'string' },
    'strict': { type: 'boolean', default: false },
    'config': { type: 'string' },
    'model': { type: 'string' },
    'provider': { type: 'string' },
    'base-url': { type: 'string' },
    'api': { type: 'string' },
    'timeout-ms': { type: 'string', default: '45000' },
  } })
  const timeoutMs = Number(values['timeout-ms'])
  const concurrency = Number(values.concurrency)
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error('concurrency must be an integer from 1 to 4')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
    throw new Error('timeout-ms must be an integer from 1 to 300000')
  const path = values.dataset ?? new URL('./cases.jsonl', import.meta.url)
  const cases = (await loadCases(path)).filter(item => (!values.id || item.id === values.id) && (!values.category || item.category === values.category))
  if (!cases.length)
    throw new Error('No cases selected')
  const configArgs = ['config', 'model', 'provider', 'base-url', 'api'] as const
  const config = values.live ? await readConfig(configArgs.flatMap(key => values[key] ? [`--${key}`, values[key]!] : []), process.env) : undefined
  if (config && (config.help || config.list))
    throw new Error('Invalid generation configuration')
  const definition = config ? listProviders().find(provider => provider.id === config.definitionId) : undefined
  const provider = definition && config ? getGenerationProvider(await definition.createProvider(config.providerConfig)) : undefined
  if (values.live && !provider)
    throw new Error('Configured provider cannot generate text')
  const target = config && provider ? { model: config.model, provider } : undefined
  const judgeTarget = target ? { ...target, model: values['judge-model'] ?? process.env.ANGELA_EVAL_JUDGE_MODEL ?? target.model } : undefined
  const results: Result[] = []
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim(),
    productionDiffSha256: hash(execFileSync('git', ['diff', 'HEAD', '--', 'apps/cli', 'core/agent', 'providers/inference'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' })),
    datasetSha256: hash(await readFile(path)),
    node: process.version,
    mode: values.live ? 'live-production-runtime' : 'prepare-only-no-network',
    retrievalMode: 'offline-lexical',
    provider: definition?.id ?? null,
    protocol: config?.api ?? null,
    endpoint: config?.baseUrl ? `${new URL(config.baseUrl).origin}${new URL(config.baseUrl).pathname}` : null,
    model: target?.model ?? null,
    judgeModel: values.judge ? judgeTarget?.model ?? null : null,
    temperature: 0,
    timeoutMs,
    requestLimit: 12,
    concurrency,
    executionSegments: [] as { sourceCommit: string, node: string, startedAt: string, fromCaseIndex: number, concurrency: number }[],
    resumedFromSha256: null as string | null,
    judgePrompt,
    judgeResponseFormat: 'json-schema',
    judgePromptSha256: hash(judgePrompt),
    selection: { id: values.id ?? null, category: values.category ?? null },
    summary: summarize(results),
    results,
  }
  if (values.resume) {
    if (!values.output)
      throw new Error('Resume requires a new output path')
    const raw = await readFile(values.resume)
    const previous = v.parse(v.object({
      schemaVersion: v.literal(1),
      sourceCommit: v.string(),
      node: v.string(),
      startedAt: v.string(),
      finishedAt: v.nullable(v.string()),
      results: v.array(resultSchema),
      datasetSha256: v.string(),
      productionDiffSha256: v.string(),
      judgePromptSha256: v.string(),
      mode: v.string(),
      retrievalMode: v.string(),
      provider: v.nullable(v.string()),
      protocol: v.nullable(v.string()),
      endpoint: v.nullable(v.string()),
      model: v.nullable(v.string()),
      judgeModel: v.nullable(v.string()),
      temperature: v.number(),
      timeoutMs: v.number(),
      requestLimit: v.number(),
      selection: v.object({ id: v.nullable(v.string()), category: v.nullable(v.string()) }),
      executionSegments: v.optional(v.array(v.object({ sourceCommit: v.string(), node: v.string(), startedAt: v.string(), fromCaseIndex: v.number(), concurrency: v.number() }))),
    }), JSON.parse(raw.toString('utf8')))
    const keys = ['datasetSha256', 'productionDiffSha256', 'judgePromptSha256', 'mode', 'retrievalMode', 'provider', 'protocol', 'endpoint', 'model', 'judgeModel', 'temperature', 'timeoutMs', 'requestLimit'] as const
    if (previous.finishedAt !== null || keys.some(key => previous[key] !== report[key]) || JSON.stringify(previous.selection) !== JSON.stringify(report.selection))
      throw new Error('Checkpoint identity differs or run already completed')
    if (previous.results.length > cases.length || previous.results.some((result, index) => result.id !== cases[index]?.id || result.category !== cases[index]?.category || JSON.stringify(result.ruleIds) !== JSON.stringify(cases[index]?.expected.expectedRuleIds)))
      throw new Error('Checkpoint results are not a dataset prefix')
    execFileSync('git', ['diff', '--exit-code', previous.sourceCommit, 'HEAD', '--', 'apps/cli', 'core/agent', 'providers/inference'], { cwd: new URL('../..', import.meta.url), stdio: 'pipe' })
    results.push(...previous.results)
    report.resumedFromSha256 = hash(raw)
    report.executionSegments.push(...previous.executionSegments ?? [{ sourceCommit: previous.sourceCommit, node: previous.node, startedAt: previous.startedAt, fromCaseIndex: 0, concurrency: 1 }])
    report.startedAt = previous.startedAt
  }
  report.executionSegments.push({ sourceCommit: report.sourceCommit, node: process.version, startedAt: new Date().toISOString(), fromCaseIndex: results.length, concurrency })
  report.summary = summarize(results)
  if (values.output)
    await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  const checkpoint = async () => {
    report.summary = summarize(results)
    if (values.output) {
      const temporary = `${values.output}.pending`
      await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
      await rename(temporary, values.output)
    }
  }
  for (let offset = results.length; offset < cases.length; offset += concurrency) {
    const batch = await Promise.all(cases.slice(offset, offset + concurrency).map(async (item): Promise<Result> => {
      const observation = await observe(item.input, target, timeoutMs)
      const result: Result = { id: item.id, category: item.category, ruleIds: item.expected.expectedRuleIds, status: 'unjudged', behaviorPassed: null, failures: [], observation }
      if (observation.prepared) {
        result.status = 'prepared'
      }
      else if (observation.infrastructureError || !observation.rawAnswer.trim()) {
        result.status = 'infrastructure-failure'
        result.failures.push({ layer: 'generation-infrastructure', reason: observation.infrastructureError ?? 'Empty model answer' })
      }
      else {
        result.failures = deterministicChecks(item, observation)
        if (values.judge && judgeTarget) {
          result.judge = await judge(item, observation, judgeTarget, timeoutMs)
          if (result.judge.judgment) {
            const failed = result.judge.judgment.checks.filter(check => !check.passed)
            result.behaviorPassed = failed.length === 0
            result.failures.push(...failed.map(check => ({ layer: 'generation', reason: `${check.id}: ${check.reason}` })))
            result.status = result.failures.length ? 'failed' : 'passed'
          }
          else {
            result.status = 'infrastructure-failure'
            result.failures.push({ layer: 'judge-infrastructure', reason: result.judge.error ?? 'Missing judgment' })
          }
        }
      }
      return result
    }))
    for (const result of batch) {
      results.push(result)
      await checkpoint()
      process.stderr.write(`${results.length}/${cases.length} ${result.id}: ${result.status}\n`)
    }
  }
  report.finishedAt = new Date().toISOString()
  await checkpoint()
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`)
  if (results.some(result => result.status === 'infrastructure-failure'))
    process.exitCode = 2
  else if (values.strict && results.some(result => result.status !== 'passed'))
    process.exitCode = 1
}

void main().catch((error: unknown) => {
  console.error(errorMessageFrom(error) ?? 'Evaluation failed')
  process.exitCode = 2
})
