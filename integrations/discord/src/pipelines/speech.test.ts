import type { RequestListener } from 'node:http'

import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'

import { afterEach, expect, it } from 'vitest'

import { convertOpusToWav } from '../utils/audio'
import { Speech } from './speech'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }))
})

async function service(handler: RequestListener) {
  const server = createServer(handler)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing local speech port')
  const baseURL = `http://127.0.0.1:${address.port}/v1`
  const speech = new Speech({
    OPENAI_STT_API_BASE_URL: baseURL,
    OPENAI_STT_MODEL: 'test-stt',
    OPENAI_STT_API_KEY: 'test-stt-key',
    OPENAI_STT_LANGUAGE: 'vi',
    OPENAI_TTS_API_BASE_URL: baseURL,
    OPENAI_TTS_MODEL: 'test-tts',
    OPENAI_TTS_API_KEY: 'test-tts-key',
    OPENAI_TTS_VOICE: 'test-voice',
  })
  return { server, speech }
}

it('uses the real SDKs for WAV transcription and configured speech output', async () => {
  const requests: { path?: string, body: Buffer, authorization?: string }[] = []
  const { speech } = await service(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request)
      chunks.push(Buffer.from(chunk))
    requests.push({ path: request.url, body: Buffer.concat(chunks), authorization: request.headers.authorization })
    if (request.url?.endsWith('/transcriptions')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ text: '  Xin chào Angela  ' }))
    }
    else {
      response.writeHead(200, { 'Content-Type': 'audio/wav' })
      response.end(Buffer.from('test-audio'))
    }
  })
  const wav = convertOpusToWav(Buffer.alloc(6400))
  const signal = new AbortController().signal
  expect(await speech.transcribe(wav, signal)).toBe('Xin chào Angela')
  expect(requests[0].path).toBe('/v1/audio/transcriptions')
  expect(requests[0].authorization).toBe('Bearer test-stt-key')
  expect(requests[0].body.includes(wav)).toBe(true)
  expect(requests[0].body.toString()).toContain('test-stt')
  expect(requests[0].body.toString()).toContain('name="language"')
  expect(await speech.synthesize('Chào bạn, mình nghe đây.', signal)).toEqual(Buffer.from('test-audio'))
  expect(requests[1].path).toBe('/v1/audio/speech')
  expect(requests[1].authorization).toBe('Bearer test-tts-key')
  expect(JSON.parse(requests[1].body.toString())).toMatchObject({
    input: 'Chào bạn, mình nghe đây.',
    model: 'test-tts',
    voice: 'test-voice',
    response_format: 'wav',
  })
})

it('aborts a pending provider request and rejects empty audio', async () => {
  const { server, speech } = await service((request, response) => {
    if (request.url?.endsWith('/speech'))
      response.end()
  })
  const controller = new AbortController()
  const received = once(server, 'request')
  const pending = speech.transcribe(convertOpusToWav(Buffer.alloc(6400)), controller.signal)
  await received
  controller.abort()
  await expect(pending).rejects.toThrow()
  await expect(speech.synthesize('Hello', new AbortController().signal)).rejects.toThrow('size')
})

it.each([{ OPENAI_STT_MODEL: undefined }, { OPENAI_STT_API_BASE_URL: 'file:///audio' }, { OPENAI_STT_API_BASE_URL: 'https://user:secret@example.com/v1/' }])('rejects incomplete or invalid speech configuration', (configuration) => {
  expect(() => new Speech({
    OPENAI_STT_API_BASE_URL: 'http://speech.test/v1/',
    OPENAI_STT_MODEL: 'stt',
    OPENAI_TTS_API_BASE_URL: 'http://speech.test/v1/',
    OPENAI_TTS_MODEL: 'tts',
    OPENAI_TTS_VOICE: 'voice',
    ...configuration,
  }).validate()).toThrow()
})
