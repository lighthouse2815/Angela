import type { cliMessages } from '@proj-airi/i18n/cli'

import { createHash } from 'node:crypto'

import * as v from 'valibot'

const vectorSchema = v.pipe(v.array(v.pipe(v.number(), v.finite())), v.minLength(1), v.maxLength(8192))
const responseSchema = v.object({ data: v.array(v.object({ index: v.pipe(v.number(), v.integer(), v.minValue(0)), embedding: vectorSchema })) })

/** Uses an explicitly selected OpenAI-compatible embedding service. No local model is installed or selected implicitly. */
export class Embeddings {
  readonly namespace: string
  private readonly url: URL
  private readonly key: string
  private readonly model: string
  private readonly queries = new Map<string, Float32Array>()
  private retryAfter = 0
  private failure = false
  private dimension?: number

  constructor(env: NodeJS.ProcessEnv, defaults: { baseUrl?: string, apiKey: string }, private readonly messages: typeof cliMessages.en) {
    this.model = env.ANGELA_EMBEDDING_MODEL?.trim() ?? ''
    if (!this.model)
      throw new Error(messages.recallEmbeddingConfig)
    this.url = new URL('embeddings', `${(env.ANGELA_EMBEDDING_BASE_URL ?? defaults.baseUrl ?? '').replace(/\/+$/u, '')}/`)
    if (!['https:', 'http:'].includes(this.url.protocol) || this.url.username || this.url.password)
      throw new Error(messages.recallEmbeddingConfig)
    // A different embedding endpoint never inherits credentials from the chat provider.
    this.key = env.ANGELA_EMBEDDING_API_KEY ?? (defaults.baseUrl && new URL(defaults.baseUrl).origin === this.url.origin ? defaults.apiKey : '')
    this.namespace = createHash('sha256').update(`${this.url.href}\n${this.model}`).digest('hex')
  }

  get dimensions() {
    return this.dimension
  }

  get status() {
    return this.failure ? 'unavailable' : 'configured'
  }

  async query(text: string, signal?: AbortSignal) {
    const key = text.slice(0, 4000)
    const cached = this.queries.get(key)
    if (cached)
      return cached
    const [vector] = await this.encode([key], signal)
    this.queries.set(key, vector!)
    if (this.queries.size > 32)
      this.queries.delete(this.queries.keys().next().value!)
    return vector!
  }

  /** Validates indexes, dimensions, finite coordinates and response size before vectors enter persistent storage. */
  async encode(texts: string[], signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (!texts.length || texts.length > 8 || texts.some(text => text.length > 4000) || Date.now() < this.retryAfter)
      throw new Error(this.messages.recallEmbeddingFailed)
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}) },
        body: JSON.stringify({ model: this.model, input: texts, encoding_format: 'float' }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
      })
      const reader = response.body?.getReader()
      try {
        if (!response.ok || !reader)
          throw new Error(this.messages.recallEmbeddingFailed)
        let length = 0
        let source = ''
        const decoder = new TextDecoder()
        while (true) {
          const chunk = await reader.read()
          if (chunk.done)
            break
          length += chunk.value.byteLength
          if (length > 2_000_000)
            throw new Error(this.messages.recallEmbeddingFailed)
          source += decoder.decode(chunk.value, { stream: true })
        }
        const parsed = v.parse(responseSchema, JSON.parse(source + decoder.decode()))
        if (parsed.data.length !== texts.length || new Set(parsed.data.map(item => item.index)).size !== texts.length)
          throw new Error(this.messages.recallEmbeddingFailed)
        const ordered = parsed.data.sort((a, b) => a.index - b.index)
        if (ordered.some((item, index) => item.index !== index || item.embedding.length !== ordered[0]!.embedding.length))
          throw new Error(this.messages.recallEmbeddingFailed)
        if (this.dimension !== undefined && this.dimension !== ordered[0]!.embedding.length)
          throw new Error(this.messages.recallEmbeddingFailed)
        this.dimension = ordered[0]!.embedding.length
        const vectors = ordered.map(({ embedding }) => {
          const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
          if (!Number.isFinite(norm) || norm === 0)
            throw new Error(this.messages.recallEmbeddingFailed)
          return Float32Array.from(embedding, value => value / norm)
        })
        this.failure = false
        return vectors
      }
      finally {
        await reader?.cancel().catch(() => {})
      }
    }
    catch {
      this.failure = true
      this.retryAfter = Date.now() + 60_000
      signal?.throwIfAborted()
      throw new Error(this.messages.recallEmbeddingFailed)
    }
  }
}
