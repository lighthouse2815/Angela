import * as v from 'valibot'

/** Durable pages share the existing recall database. Working memory stays in Chat and bounded observations. */
export const pageSchema = v.object({
  id: v.string(),
  tier: v.picklist(['episodic', 'semantic', 'procedural']),
  kind: v.string(),
  scope: v.string(),
  key: v.string(),
  title: v.string(),
  body: v.string(),
  abstract: v.string(),
  status: v.picklist(['active', 'superseded', 'compacted']),
  authority: v.picklist(['inference', 'episode', 'consolidated', 'project', 'verified', 'personal', 'user']),
  salience: v.number(),
  pinned: v.boolean(),
  accessCount: v.number(),
  createdAt: v.string(),
  updatedAt: v.string(),
  lastAccessedAt: v.nullable(v.string()),
  supersededBy: v.nullable(v.string()),
  compactedAt: v.nullable(v.string()),
  expiresAt: v.nullable(v.string()),
  sourceSessionId: v.nullable(v.string()),
  version: v.string(),
})

export type MemoryPage = v.InferOutput<typeof pageSchema>
export type MemoryTier = MemoryPage['tier']
export type MemoryAuthority = MemoryPage['authority']
export type MemoryRelation = 'related_to' | 'supersedes' | 'contradicts' | 'derived_from'

/** Explicit sources outrank inferred summaries. This order governs mutation, independently of retrieval relevance. */
export const authority: Record<MemoryAuthority, number> = { inference: 0, episode: 1, consolidated: 2, project: 3, verified: 4, personal: 5, user: 6 }

export interface PageInput {
  tier: MemoryTier
  kind: string
  scope: string
  key: string
  title: string
  body: string
  abstract?: string
  authority: MemoryAuthority
  salience?: number
  pinned?: boolean
  sourceSessionId?: string
  expiresAt?: string
  expectedVersion?: string | null
}

/** Sanitized observations retain request identity without raw arguments or provider payloads. */
export interface Observation {
  id: string
  type: string
  correlationId: string
  sessionId: string
  scope: string
  channel: string
  timestamp: string
  text: string
  verified: boolean
}
