import process from 'node:process'

import { loadCases } from './schema'

/**
 * Checks all labels before any memory fixture is created.
 *
 * Call stack:
 * main -> loadCases -> caseSchema -> unique IDs and category counts
 */
async function main() {
  const cases = await loadCases(new URL('./cases.jsonl', import.meta.url))
  const counts = Object.fromEntries([...new Set(cases.map(item => item.category))].map(category => [category, cases.filter(item => item.category === category).length]))
  process.stdout.write(`${JSON.stringify({ cases: cases.length, categories: counts }, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
