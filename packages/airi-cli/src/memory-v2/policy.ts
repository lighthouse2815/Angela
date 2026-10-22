import type { MemoryPage } from './types'

const day = 86_400_000

/** Retention follows ai-memory's decay.rs. Durable knowledge and pinned pages never decay automatically. */
export function retention(page: Pick<MemoryPage, 'tier' | 'pinned' | 'updatedAt' | 'lastAccessedAt' | 'accessCount' | 'salience'>, now = Date.now()) {
  if (page.pinned || page.tier !== 'episodic')
    return Number.POSITIVE_INFINITY
  const age = Math.max(0, now - Date.parse(page.updatedAt)) / day
  const sinceAccess = page.lastAccessedAt === null ? undefined : Math.max(0, now - Date.parse(page.lastAccessedAt)) / day
  const salience = Math.max(0.25, Math.min(2, page.salience))
  return salience * Math.exp(-Math.LN2 / 90 * age)
    + (sinceAccess === undefined ? 0 : 0.6 * Math.log1p(page.accessCount) * Math.exp(-0.04 * sinceAccess))
}

/** Extractive compaction preserves the abstract, decisions, and bounded literal facts before any eviction. */
export function compact(page: Pick<MemoryPage, 'body' | 'abstract'>) {
  const facts = new Set<string>()
  const patterns = [
    /https?:\/\/[^\s<>()[\]"'`]+/gu,
    /(?:\b|\/)(?:[\w.-]+\/)+[\w.-]+\.\w+\b/gu,
    /\b[\w.-]+\.(?:ts|tsx|js|json|md|sql|yaml|yml|py|rs|toml)\b/gu,
    /\b(?:E\d{2,4}|HTTP\s?\d{3}|ERR_[A-Z_]+|\d{4}-\d{2}-\d{2})\b/gu,
    /`([^`\n]{2,128})`/gu,
    /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/gu,
  ]
  for (const pattern of patterns) {
    for (const match of page.body.matchAll(pattern)) {
      const value = (match[1] ?? match[0]).replace(/[.,]+$/u, '')
      if (value.length <= 256 && facts.size < 48)
        facts.add(value)
    }
  }
  const lines = page.body.split(/\r?\n/u)
  const decisions = lines.filter(line => /^(?:Decision|Fact|Next step|Goal|Failed|Completed|User|Project|Workflow|Name|Date):/iu.test(line)).slice(0, 20).map(line => line.slice(0, 400))
  const summary = page.abstract || lines.find(line => line.trim() && !line.startsWith('#')) || ''
  return [summary.slice(0, 500), ...decisions, ...[...facts].map(fact => `- ${fact}`)].join('\n').slice(0, 12_000)
}
