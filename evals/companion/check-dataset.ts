import process from 'node:process'

import { readFile } from 'node:fs/promises'

import * as v from 'valibot'

import { caseSchema } from './schema'

/**
 * Checks all labels before any memory fixture is created.
 *
 * Call stack:
 * main -> JSON.parse -> caseSchema -> unique IDs and category counts
 */
async function main() {
  const lines = (await readFile(new URL('./cases.jsonl', import.meta.url), 'utf8')).trim().split('\n')
  const cases = lines.map(line => v.parse(caseSchema, JSON.parse(line)))
  if (new Set(cases.map(item => item.id)).size !== cases.length)
    throw new Error('Duplicate case ID')
  const counts = Object.fromEntries([...new Set(cases.map(item => item.category))].map(category => [category, cases.filter(item => item.category === category).length]))
  process.stdout.write(`${JSON.stringify({ cases: cases.length, categories: counts }, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
