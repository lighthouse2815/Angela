import type { Result } from './scoring'

import process from 'node:process'

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { getGenerationProvider, listProviders } from '@angela/provider-inference'
import { errorMessageFrom } from '@moeru/std'

import { readConfig } from '../../packages/angela-cli/src/config'
import { observe } from './harness'
import { loadCases } from './schema'
import { deterministicChecks, judge, judgePrompt, summarize } from './scoring'

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
    productionDiffSha256: hash(execFileSync('git', ['diff', 'HEAD', '--', 'packages/angela-cli', 'packages/core-agent', 'packages/provider-inference'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' })),
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
    judgePrompt,
    judgeResponseFormat: 'json-schema',
    judgePromptSha256: hash(judgePrompt),
    selection: { id: values.id ?? null, category: values.category ?? null },
    summary: summarize(results),
    results,
  }
  if (values.output)
    await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  const checkpoint = async () => {
    report.summary = summarize(results)
    if (values.output)
      await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`)
  }
  for (const item of cases) {
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
    results.push(result)
    await checkpoint()
    process.stderr.write(`${results.length}/${cases.length} ${item.id}: ${result.status}\n`)
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
