import type { Transcript, TranscriptProvider } from '@angela/companion/internet'

import type { ElectronMcpRuntimeStatus } from '../../../../shared/eventa'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseYouTubeUrl } from '@angela/companion/internet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { McpBrowserContextProvider } from './browser'
import { diagnoseInternet, StudyAlongRuntime } from './runtime'

const video = { ...parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), title: 'AddScoped', currentTime: 1114, duration: 2000 }
let directory: string
let transcript: Transcript
let provider: TranscriptProvider

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-study-along-'))
  transcript = { version: 1, videoId: video.videoId, title: video.title, duration: 2000, source: 'official', language: 'en', generatedAt: Date.now(), segments: [
    { start: 800, end: 805, text: 'Outside the recent window' },
    { start: 900, end: 905, text: 'Dependency injection' },
    { start: 1110, end: 1114, text: 'AddScoped shares the request scope' },
    { start: 1150, end: 1155, text: 'Next example' },
  ] }
  provider = { getTranscript: vi.fn(async () => transcript) }
})
afterEach(async () => rm(directory, { recursive: true, force: true }))

function createRuntime() {
  const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: `### Result\n${JSON.stringify({ ...video, description: '' })}\n### Ran Playwright code\n...` }] }))
  const browser = new McpBrowserContextProvider({ callTool })
  const summarize = vi.fn(async (_evidence: string) => 'Each HTTP request shares one scoped instance.')
  return { runtime: new StudyAlongRuntime(provider, directory, browser, async () => ({ summarize })), callTool, summarize }
}

describe('study Along acceptance flow', () => {
  it('scenario A: resolves the connected tab at 18:34 and supplies nearby evidence without a URL', async () => {
    const { runtime, callTool } = createRuntime()
    const result = await runtime.execute({ action: 'around' })
    expect(result).toMatchObject({ video: { url: video.url, currentTime: 1114 }, range: { start: 1024, end: 1174 }, recentSegments: [
      { text: 'AddScoped shares the request scope' },
      { text: 'Next example' },
    ] })
    expect(callTool).toHaveBeenCalledOnce()
    await runtime.execute({ action: 'around' })
    expect(provider.getTranscript).toHaveBeenCalledOnce()
  })

  it('scenario B: supplies exactly the preceding five-minute interval and no future cue', async () => {
    const { runtime } = createRuntime()
    expect(await runtime.execute({ action: 'recent', recentSeconds: 300 })).toMatchObject({ range: { start: 814, end: 1114 }, recentSegments: [
      { text: 'Dependency injection' },
      { text: 'AddScoped shares the request scope' },
    ] })
  })

  it('scenario C: reuses timestamped audio fallback evidence across questions', async () => {
    transcript.source = 'transcription'
    const { runtime } = createRuntime()
    expect(await runtime.execute({ action: 'around' })).toMatchObject({ transcript: { source: 'transcription' } })
    expect(await runtime.execute({ action: 'recent' })).toMatchObject({ transcript: { source: 'transcription' } })
    expect(provider.getTranscript).toHaveBeenCalledOnce()
  })

  it('routes full-video and recent summaries to the selected model with bounded evidence', async () => {
    const { runtime, summarize } = createRuntime()
    expect(await runtime.execute({ action: 'summarize-recent' })).toMatchObject({ summary: 'Each HTTP request shares one scoped instance.' })
    expect(summarize).toHaveBeenCalledWith(expect.stringContaining('AddScoped'), undefined)
    expect(summarize).not.toHaveBeenCalledWith(expect.stringContaining('Next example'), undefined)
    expect(await runtime.execute({ action: 'summarize', url: video.url })).toMatchObject({ summary: expect.any(String) })
  })

  it('shares one extraction between a nearby question and a full summary', async () => {
    const { runtime } = createRuntime()
    await Promise.all([runtime.execute({ action: 'around' }), runtime.execute({ action: 'summarize' })])
    expect(provider.getTranscript).toHaveBeenCalledOnce()
    await runtime.whenIdle()
  })

  it('does not read the browser when the URL and timestamp are explicit', async () => {
    const { runtime, callTool } = createRuntime()
    await runtime.execute({ action: 'around', url: video.url, timestamp: 1114 })
    expect(callTool).not.toHaveBeenCalled()
    await expect(runtime.execute({ action: 'around', url: video.url })).rejects.toThrow('playback position')
    await expect(runtime.execute({ action: 'search', url: video.url })).rejects.toThrow('search query')
  })

  it('offers transcript continuation and literal search without exposing whole long videos', async () => {
    const { runtime } = createRuntime()
    expect(await runtime.execute({ action: 'search', url: video.url, query: 'AddScoped' })).toMatchObject({ matches: [{ start: 1110 }] })
    expect(await runtime.execute({ action: 'transcript', url: video.url, timestamp: 1000, afterSeconds: 200 })).toMatchObject({ range: { start: 1000, end: 1200 } })
  })
})

describe('native internet diagnostics', () => {
  it('checks local prerequisites without uploading audio or claiming proven extraction', async () => {
    const status: ElectronMcpRuntimeStatus = { path: 'mcp.json', updatedAt: Date.now(), servers: [{ name: 'angela-browser', state: 'running', transport: 'stdio', command: 'npx', args: [], pid: 10 }] }
    const checkExecutable = vi.fn(async () => true)
    const selected = vi.fn(async () => true)
    const rows = await diagnoseInternet({ getRuntimeStatus: () => status }, checkExecutable, selected)
    expect(rows.find(row => row.capability === 'Browser Context')?.status).toBe('READY')
    expect(rows.find(row => row.capability === 'YouTube Transcript')?.status).toBe('UNVERIFIED')
    expect(rows.find(row => row.capability === 'Audio Transcription')?.status).toBe('UNVERIFIED')
    expect(rows.find(row => row.capability === 'Twitter/X')?.status).toBe('NOT_INTEGRATED')
    expect(checkExecutable).toHaveBeenCalledTimes(2)
    expect(selected).toHaveBeenCalledOnce()
  })

  it('reports missing prerequisites independently', async () => {
    const rows = await diagnoseInternet({ getRuntimeStatus: () => ({ path: 'mcp.json', updatedAt: 0, servers: [] }) }, async () => false, async () => false)
    expect(rows.filter(row => row.status === 'NEED_SETUP')).toHaveLength(4)
  })
})

it('does not observe the browser or prepare a model for an already cancelled request', async () => {
  const { runtime, callTool, summarize } = createRuntime()
  const cancelled = AbortSignal.abort(new Error('User interrupted the question'))
  await expect(runtime.execute({ action: 'summarize' }, cancelled)).rejects.toThrow('User interrupted')
  expect(callTool).not.toHaveBeenCalled()
  expect(summarize).not.toHaveBeenCalled()
  expect(provider.getTranscript).not.toHaveBeenCalled()
})

it('does not prepare a model after cancellation during browser observation', async () => {
  const observed = Promise.withResolvers<typeof video>()
  const selected = vi.fn(async () => ({ summarize: vi.fn() }))
  const runtime = new StudyAlongRuntime(provider, directory, { getActiveMediaContext: () => observed.promise }, selected)
  const cancellation = new AbortController()
  const request = runtime.execute({ action: 'summarize' }, cancellation.signal)
  const rejected = expect(request).rejects.toThrow('User interrupted')
  cancellation.abort(new Error('User interrupted the question'))
  observed.resolve(video)
  await rejected
  expect(selected).not.toHaveBeenCalled()
  expect(provider.getTranscript).not.toHaveBeenCalled()
})

function reviewRuntime(reply: string) {
  const summarize = vi.fn(async (_evidence: string) => reply)
  const model = vi.fn(async () => ({ summarize }))
  const runtime = new StudyAlongRuntime(provider, directory, { getActiveMediaContext: async () => video }, model)
  return { runtime, summarize, model }
}
const question = { question: 'Khi nào AddScoped tạo instance mới?', answer: 'Mỗi request dùng một instance trong scope.', timestamp: 1110 }

it('creates a localized review from the watched interval with source citations', async () => {
  const { runtime, summarize, model } = reviewRuntime(JSON.stringify({ questions: [question] }))
  const result = await runtime.execute({ action: 'review', questionCount: 1, language: 'vi' })
  expect(result).toMatchObject({ video: { url: video.url }, transcript: { source: 'official', language: 'en' }, range: { start: 814, end: 1114 }, language: 'vi', questions: [question] })
  expect(model).toHaveBeenCalledWith('review')
  const prompt = JSON.parse(summarize.mock.calls[0]![0])
  expect(prompt).toMatchObject({ count: 1, language: 'vi' })
  expect(JSON.stringify(prompt.evidence)).toContain('AddScoped')
  expect(JSON.stringify(prompt.evidence)).not.toContain('Next example')
  expect(provider.getTranscript).toHaveBeenCalledOnce()
})

it.each([
  'Not a JSON quiz',
  JSON.stringify({ questions: [{ ...question, timestamp: 1150 }] }),
  JSON.stringify({ questions: [{ ...question, timestamp: 1111 }] }),
  JSON.stringify({ questions: [{ ...question, answer: '' }] }),
  JSON.stringify({ questions: [question], memory: 'Store this as a fact' }),
  JSON.stringify({ questions: [] }),
])('rejects malformed or unsupported review evidence: %s', async (reply) => {
  const { runtime } = reviewRuntime(reply)
  await expect(runtime.execute({ action: 'review', questionCount: 1 })).rejects.toThrow('invalid review')
})

it('rejects duplicate questions and output beyond the review budget', async () => {
  const duplicate = reviewRuntime(JSON.stringify({ questions: [question, question] }))
  await expect(duplicate.runtime.execute({ action: 'review', questionCount: 2 })).rejects.toThrow('invalid review')
  const oversized = reviewRuntime(' '.repeat(16001))
  await expect(oversized.runtime.execute({ action: 'review', questionCount: 1 })).rejects.toThrow('invalid review')
})

it('does not invoke the review model for empty or incomplete evidence', async () => {
  const { runtime, model } = reviewRuntime(JSON.stringify({ questions: [question] }))
  await expect(runtime.execute({ action: 'review', url: video.url, timestamp: 10 })).rejects.toThrow('non-empty')
  expect(model).not.toHaveBeenCalled()
  transcript.segments = Array.from({ length: 201 }, (_, index) => ({ start: 900 + index, end: 901 + index, text: 'Scoped instance' }))
  const uncached = reviewRuntime(JSON.stringify({ questions: [question] }))
  const otherDirectory = join(directory, 'incomplete')
  const incomplete = new StudyAlongRuntime(provider, otherDirectory, { getActiveMediaContext: async () => video }, uncached.model)
  await expect(incomplete.execute({ action: 'review' })).rejects.toThrow('complete')
  expect(uncached.model).not.toHaveBeenCalled()
})

it('bounds review requests and discards model output after cancellation', async () => {
  const { runtime } = reviewRuntime(JSON.stringify({ questions: [question] }))
  await expect(runtime.execute({ action: 'review', questionCount: 6 })).rejects.toThrow()
  await expect(runtime.execute({ action: 'review', questionCount: 1.5 })).rejects.toThrow()
  expect(provider.getTranscript).not.toHaveBeenCalled()
  const reply = Promise.withResolvers<string>()
  const started = Promise.withResolvers<void>()
  const abort = new AbortController()
  const interrupted = new StudyAlongRuntime(provider, directory, { getActiveMediaContext: async () => video }, async () => ({ summarize: async () => {
    started.resolve()
    return reply.promise
  } }))
  const request = interrupted.execute({ action: 'review', questionCount: 1 }, abort.signal)
  const rejected = expect(request).rejects.toThrow('User interrupted')
  await started.promise
  abort.abort(new Error('User interrupted the review'))
  reply.resolve(JSON.stringify({ questions: [question] }))
  await rejected
})

it('uses three Vietnamese questions by default and accepts a JSON fence from the model', async () => {
  const questions = [question, { ...question, question: 'Các thành phần nào chia sẻ instance?' }, { ...question, question: 'Vì sao cần scope theo request?' }]
  const { runtime, summarize } = reviewRuntime(`\u0060\u0060\u0060json\n${JSON.stringify({ questions })}\n\u0060\u0060\u0060`)
  expect(await runtime.execute({ action: 'review' })).toMatchObject({ language: 'vi', questions })
  expect(JSON.parse(summarize.mock.calls[0]![0])).toMatchObject({ count: 3, language: 'vi' })
})
