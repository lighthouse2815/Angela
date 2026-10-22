import process from 'node:process'

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { evaluateCase, summarize } from './evaluation'
import { loadCases } from './schema'

/**
 * Runs sequential offline evaluations. A failed quality case is report data, while --strict makes it a CI failure.
 *
 * Call stack:
 * main -> loadCases -> evaluateCase -> MemoryCapture / MemoryStore -> Recall -> buildContext -> score -> summarize
 */
async function main() {
  const { values } = parseArgs({ options: {
    dataset: { type: 'string' },
    output: { type: 'string' },
    category: { type: 'string' },
    id: { type: 'string' },
    strict: { type: 'boolean', default: false },
  } })
  const path = values.dataset ?? new URL('./cases.jsonl', import.meta.url)
  const cases = (await loadCases(path)).filter(item => (!values.category || item.category === values.category) && (!values.id || item.id === values.id))
  if (!cases.length)
    throw new Error('No cases selected')
  const results = []
  for (const item of cases)
    results.push(await evaluateCase(item))
  const summary = summarize(results)
  const report = {
    schemaVersion: 1,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim(),
    datasetSha256: createHash('sha256').update(await readFile(path)).digest('hex'),
    node: process.version,
    mode: 'offline-lexical-with-explicit-extraction-fixtures',
    topK: 5,
    summary,
    results,
  }
  if (values.output)
    await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (values.strict && results.some(result => !result.passed))
    process.exitCode = 1
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
