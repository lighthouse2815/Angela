import { describe, expect, it, vi } from 'vitest'

import { CompatibleTranscriptionProvider } from './transcription'

describe('timestamped transcription HTTP boundary', () => {
  const config = async () => ({ baseUrl: 'https://api.example.test/v1/', apiKey: 'test-only-key', model: 'whisper-1' })

  it('sends timestamp requirements only to the selected provider', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ segments: [{ start: 1, end: 2, text: 'Lesson' }] })))
    const provider = new CompatibleTranscriptionProvider(config, request)
    expect(await provider.transcribe(new Uint8Array([1, 2]))).toEqual([{ start: 1, end: 2, text: 'Lesson' }])
    expect(request).toHaveBeenCalledWith(new URL('https://api.example.test/v1/audio/transcriptions'), expect.objectContaining({ redirect: 'error', credentials: 'omit' }))
    const [, options] = request.mock.calls[0]!
    if (!(options?.body instanceof FormData))
      throw new Error('Expected a multipart upload.')
    const form = options.body
    expect(form.get('response_format')).toBe('verbose_json')
    expect(form.get('timestamp_granularities[]')).toBe('segment')
    expect(form.get('model')).toBe('whisper-1')
  })

  it('sanitizes upstream errors and never retries another recipient', async () => {
    const request = vi.fn(async () => new Response('Authorization: Bearer test-only-key', { status: 401 }))
    const provider = new CompatibleTranscriptionProvider(config, request)
    await expect(provider.transcribe(new Uint8Array([1]))).rejects.toThrow('PROVIDER_FAILED')
    await expect(provider.transcribe(new Uint8Array([1]))).rejects.not.toThrow('test-only-key')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('rejects responses without timestamped segments', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ text: 'No timestamps' })))
    await expect(new CompatibleTranscriptionProvider(config, request).transcribe(new Uint8Array([1]))).rejects.toThrow('PROVIDER_FAILED')
  })

  it('rejects insecure destinations before upload', async () => {
    const request = vi.fn()
    const insecure = async () => ({ ...(await config()), baseUrl: 'http://example.test/v1/' })
    await expect(new CompatibleTranscriptionProvider(insecure, request).transcribe(new Uint8Array([1]))).rejects.toThrow('NEED_SETUP')
    expect(request).not.toHaveBeenCalled()
  })
})
