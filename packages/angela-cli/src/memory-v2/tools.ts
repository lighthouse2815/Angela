import type { Tool } from '@xsai/shared-chat'

import type { MemoryStore } from './store'

import * as v from 'valibot'

import { durableWriteRejection, requestPrivacy } from '../privacy-policy'

const saveSchema = v.object({
  tier: v.picklist(['semantic', 'procedural']),
  kind: v.picklist(['architecture', 'decision', 'gotcha', 'workflow']),
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
  source_quote: v.pipe(v.string(), v.minLength(1), v.maxLength(4000)),
  expected_version: v.nullable(v.string()),
})

/** Authority comes from exact user or verified tool evidence. Personal preferences remain under Personal Memory's existing tools. */
export function pageTools(store: MemoryStore, scope: string, sessionId: string, userText: string, verified: readonly string[], privacy = requestPrivacy(userText)): Tool[] {
  return [{
    type: 'function',
    function: {
      name: 'memory_page_save',
      description: 'Save technical architecture, a decision, a gotcha, or an explicit workflow. Body must be a verbatim source excerpt. Keep personal preferences in personal_memory. Use the current page version to replace a claim.',
      parameters: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['semantic', 'procedural'] },
          kind: { type: 'string', enum: ['architecture', 'decision', 'gotcha', 'workflow'] },
          key: { type: 'string', minLength: 1, maxLength: 100 },
          title: { type: 'string', minLength: 1, maxLength: 160 },
          body: { type: 'string', minLength: 1, maxLength: 2000 },
          source_quote: { type: 'string', minLength: 1, maxLength: 4000 },
          expected_version: { type: ['string', 'null'] },
        },
        required: ['tier', 'kind', 'key', 'title', 'body', 'source_quote', 'expected_version'],
        additionalProperties: false,
      },
    },
    execute: (input, options) => {
      const rejection = durableWriteRejection(privacy, 'workflow', input)
      if (rejection)
        return rejection
      const parsed = v.safeParse(saveSchema, input)
      if (!parsed.success)
        return { status: 'rejected', reason: 'invalid-input' }
      const call = parsed.output
      const user = userText.includes(call.source_quote)
      if ((!user && !verified.some(text => text.includes(call.source_quote))) || !call.source_quote.includes(call.body))
        return { status: 'rejected', reason: 'missing-evidence' }
      const current = store.current(scope, call.tier, call.key)
      if ((current?.version ?? null) !== call.expected_version)
        return { status: 'rejected', reason: 'version-conflict', current }
      options.abortSignal?.throwIfAborted()
      try {
        const page = store.write({ ...call, expectedVersion: call.expected_version, authority: user ? 'user' : 'verified', scope, sourceSessionId: sessionId, salience: 1.5 })
        return { status: 'saved', id: `memory:${page.id}`, version: page.version }
      }
      catch {
        return { status: 'rejected', reason: 'authority-or-storage' }
      }
    },
  }]
}
