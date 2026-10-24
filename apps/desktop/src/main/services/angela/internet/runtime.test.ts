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
