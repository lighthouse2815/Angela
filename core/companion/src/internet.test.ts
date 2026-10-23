import type { Transcript, TranscriptProvider, VideoSummarizer } from './internet'

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InternetService, parseYouTubeUrl } from './internet'
import { FileTranscriptCache } from './internet/cache'

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
let directory: string
let transcript: Transcript
let provider: TranscriptProvider
let cache: FileTranscriptCache

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-internet-test-'))
  transcript = {
    version: 1,
    videoId: 'dQw4w9WgXcQ',
    title: 'Dependency injection lesson',
    duration: 2000,
    language: 'en',
    source: 'official',
    generatedAt: Date.now(),
    segments: [
      { start: 0, end: 10, text: 'Introduction' },
      { start: 810, end: 815, text: 'Earlier example' },
      { start: 1024, end: 1030, text: 'Request scope' },
      { start: 1114, end: 1120, text: 'AddScoped shares one instance in a request.' },
      { start: 1174, end: 1180, text: 'Next topic' },
    ],
  }
  provider = { getTranscript: vi.fn(async () => transcript) }
  cache = new FileTranscriptCache(directory)
})
afterEach(async () => rm(directory, { recursive: true, force: true }))

describe('youTube URL boundary', () => {
  it.each([
    url,
    'https://youtu.be/dQw4w9WgXcQ?t=3',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=abc',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ])('canonicalizes %s', input => expect(parseYouTubeUrl(input).url).toBe(url))

  it.each([
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'file:///tmp/video',
    'not a URL',
    'https://user:password@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=short',
    'https://youtube.com/playlist?list=abc',
    'https://localhost/watch?v=dQw4w9WgXcQ',
    'https://youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ/extra',
  ])('rejects %s', input => expect(() => parseYouTubeUrl(input)).toThrow('INVALID_URL'))
})

describe('timestamped lesson evidence', () => {
  it('selects the 90/60-second window at 18:34 with exact boundary exclusion', async () => {
    const service = new InternetService(provider, cache)
    const result = await service.getTranscriptAround(url, 1114)
    expect(result.range).toEqual({ start: 1024, end: 1174 })
    expect(result.recentSegments.map(segment => segment.text)).toEqual(['Request scope', 'AddScoped shares one instance in a request.'])
    expect(result.video.currentTime).toBe(1114)
    expect(result.truncated).toBe(false)
  })

  it('takes the preceding five minutes through the active browser without a user URL', async () => {
    const browser = { getActiveTab: vi.fn(async () => ({ url, title: 'Lesson' })), getActiveMediaContext: vi.fn(async () => ({ ...parseYouTubeUrl(url), title: 'Lesson', currentTime: 1114, duration: 2000 })) }
    const result = await new InternetService(provider, cache, browser).getActiveLessonContext(300)
    expect(browser.getActiveMediaContext).toHaveBeenCalledOnce()
    expect(result.range).toEqual({ start: 814, end: 1114 })
    expect(result.recentSegments.map(segment => segment.text)).toEqual(['Earlier example', 'Request scope'])
    expect(result.video.title).toBe('Lesson')
  })

  it('never infers an unknown browser position as zero', async () => {
    const browser = { getActiveTab: vi.fn(), getActiveMediaContext: vi.fn(async () => parseYouTubeUrl(url)) }
    await expect(new InternetService(provider, cache, browser).getActiveLessonContext()).rejects.toThrow('playback position')
    expect(provider.getTranscript).not.toHaveBeenCalled()
  })

  it('rejects invalid positions and windows before extraction', async () => {
    const service = new InternetService(provider, cache)
    await expect(service.getTranscriptAround(url, Number.NaN)).rejects.toThrow()
    await expect(service.getTranscriptAround(url, -1)).rejects.toThrow()
    await expect(service.getTranscriptAround(url, 1, 0, 0)).rejects.toThrow()
    await expect(service.getTranscriptAround(url, 1, 4000)).rejects.toThrow()
    expect(provider.getTranscript).not.toHaveBeenCalled()
  })

  it('bounds dense excerpts and exposes a continuation position', async () => {
    transcript.segments = Array.from({ length: 220 }, (_, index) => ({ start: index, end: index + 1, text: 'Evidence' }))
    const result = await new InternetService(provider, cache).getTranscriptAround(url, 200, 200, 60)
    expect(result.recentSegments).toHaveLength(200)
    expect(result.truncated).toBe(true)
    expect(result.nextTimestamp).toBe(200)
  })

  it('searches literal normalized text without treating it as a regex', async () => {
    const service = new InternetService(provider, cache)
    expect((await service.searchTranscript(url, 'ADDSCOPED')).matches).toHaveLength(1)
    expect((await service.searchTranscript(url, '.*')).matches).toHaveLength(0)
  })
})

describe('transcript cache and recovery', () => {
  it('coalesces simultaneous requests and survives a service restart', async () => {
    const service = new InternetService(provider, cache)
    await Promise.all([service.getTranscript(url), service.getTranscript('https://youtu.be/dQw4w9WgXcQ')])
    expect(provider.getTranscript).toHaveBeenCalledOnce()
    const restarted = new InternetService(provider, new FileTranscriptCache(directory))
    expect((await restarted.getTranscript(url)).segments).toEqual(transcript.segments)
    expect(provider.getTranscript).toHaveBeenCalledOnce()
    const result = await restarted.getTranscript(url)
    result.segments[0]!.text = 'Changed'
    expect((await restarted.getTranscript(url)).segments[0]!.text).toBe('Introduction')
  })

  it('does not cache provider failure or empty evidence and permits retry', async () => {
    const getTranscript = vi.fn().mockRejectedValueOnce(new Error('Provider failed')).mockResolvedValueOnce({ ...transcript, segments: [] }).mockResolvedValueOnce(transcript)
    const service = new InternetService({ getTranscript }, cache)
    await expect(service.getTranscript(url)).rejects.toThrow('Provider failed')
    await expect(service.getTranscript(url)).rejects.toThrow()
    expect((await service.getTranscript(url)).source).toBe('official')
    expect(getTranscript).toHaveBeenCalledTimes(3)
  })

  it('rejects mismatched evidence without contaminating the cache', async () => {
    transcript.videoId = 'aaaaaaaaaaa'
    await expect(new InternetService(provider, cache).getTranscript(url)).rejects.toThrow('another video')
    expect(await cache.get('dQw4w9WgXcQ')).toBeUndefined()
  })

  it('expires stored evidence and treats corruption as a miss', async () => {
    await cache.set(transcript)
    expect(await new FileTranscriptCache(directory, () => transcript.generatedAt + 31 * 86400000).get(transcript.videoId)).toBeUndefined()
    await writeFile(join(directory, `video-transcript-youtube-${transcript.videoId}.json`), '{broken')
    expect(await cache.get(transcript.videoId)).toBeUndefined()
    expect(await readFile(join(directory, `video-transcript-youtube-${transcript.videoId}.json`), 'utf8')).toBe('{broken')
  })
})

describe('bounded summarization', () => {
  it('summarizes recent evidence without unrelated sections', async () => {
    const summarizer: VideoSummarizer = { summarize: vi.fn(async () => 'One service instance per request.') }
    const result = await new InternetService(provider, cache, undefined, summarizer).summarizeRecentVideoContext(url, 1120)
    expect(result.summary).toContain('per request')
    expect(summarizer.summarize).toHaveBeenCalledWith(expect.stringContaining('AddScoped'), undefined)
    expect(summarizer.summarize).not.toHaveBeenCalledWith(expect.stringContaining('Introduction'), undefined)
  })

  it('summarizes all batches without sending a long transcript in one model request', async () => {
    transcript.segments = Array.from({ length: 90 }, (_, index) => ({ start: index * 10, end: index * 10 + 8, text: `Part ${index}: ${'lesson '.repeat(180)}` }))
    const summarize = vi.fn<VideoSummarizer['summarize']>(async () => 'Timestamped lesson summary')
    const result = await new InternetService(provider, cache, undefined, { summarize }).summarizeVideo(url)
    expect(result.summary).toBe('Timestamped lesson summary')
    expect(summarize.mock.calls.length).toBeGreaterThan(2)
    for (const call of summarize.mock.calls)
      expect(call[0].length).toBeLessThanOrEqual(16004)
  })
})
