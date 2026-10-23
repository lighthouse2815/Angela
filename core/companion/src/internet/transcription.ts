// Derived in part from Agent-Reach. MIT. See THIRD_PARTY_NOTICES.md.
import type { TranscriptionProvider } from './contracts'

import * as v from 'valibot'

import { InternetError, segmentSchema } from './contracts'
import { readProviderText } from './http'

/** Uses the existing saved provider settings. Hosts select the provider before constructing this boundary. */
export interface TranscriptionConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * Supports OpenAI Whisper and Groq through the same timestamped HTTP protocol.
 * Credentials remain private. Redirects and automatic provider switching are forbidden.
 */
export class CompatibleTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly config: () => Promise<TranscriptionConfig>, private readonly request: typeof fetch = fetch) {}

  async transcribe(audio: Uint8Array, signal?: AbortSignal) {
    if (!audio.length || audio.length > 24 * 1024 * 1024)
      throw new InternetError('LIMIT_EXCEEDED', 'Audio upload must contain at most 24 MiB.')
    const config = await this.config()
    const url = new URL('audio/transcriptions', `${config.baseUrl.replace(/\/+$/u, '')}/`)
    if (url.protocol !== 'https:' || url.username || url.password || !config.model || !config.apiKey)
      throw new InternetError('NEED_SETUP', 'Select a valid HTTPS transcription provider and model.')
    const body = new FormData()
    body.set('file', new Blob([new Uint8Array(audio)], { type: 'audio/mp4' }), 'lesson.m4a')
    body.set('model', config.model)
    body.set('response_format', 'verbose_json')
    body.append('timestamp_granularities[]', 'segment')
    try {
      const response = await this.request(url, {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
      })
      const result = v.parse(v.object({ segments: v.pipe(v.array(segmentSchema), v.maxLength(10000)) }), JSON.parse(await readProviderText(response)))
      return result.segments
    }
    catch {
      if (signal?.aborted)
        throw new InternetError('CANCELLED', 'Audio transcription was cancelled.')
      // Provider errors can echo secrets or submitted audio metadata. Only this fixed message leaves the boundary.
      throw new InternetError('PROVIDER_FAILED', 'Timestamped audio transcription failed. The selected provider was not changed.')
    }
  }
}
