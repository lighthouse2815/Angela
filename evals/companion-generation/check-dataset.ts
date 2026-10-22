import { loadCases } from './schema'

async function main() {
  const cases = await loadCases(new URL('./cases.jsonl', import.meta.url))
  console.info(JSON.stringify({ cases: cases.length, categories: new Set(cases.map(item => item.category)).size, rules: new Set(cases.flatMap(item => item.expected.expectedRuleIds)).size }))
}

void main()
