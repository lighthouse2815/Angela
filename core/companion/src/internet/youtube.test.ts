import type { TranscriptionProvider } from './contracts'

import { access, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { parseYouTubeUrl } from './contracts'
import { parseCaptionJson, YouTubeTranscriptProvider } from './youtube'

const video = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')
const caption = { events: [{ tStartMs: 1114000, dDurationMs: 6000, segs: [{ utf8: 'AddScoped creates a request-scoped service.' }] }] }
const track = [{ ext: 'json3', url: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ' }]

function metadata(overrides = {}) {
  return JSON.stringify({ id: video.videoId, title: 'Lesson', duration: 1200, subtitles: {}, automatic_captions: {}, ...overrides })
}

describe('youTube fallback policy', () => {
  it('preserves timestamps and merges adjacent repeated rolling captions', () => {
    const event = caption.events[0]!
    expect(parseCaptionJson({ events: [event, { ...event, tStartMs: 1119000 }] })).toEqual([
      { start: 1114, end: 1125, text: 'AddScoped creates a request-scoped service.' },
    ])
  })

  it('uses manual captions before automatically generated captions', async () => {
    const run = vi.fn(async () => metadata({ subtitles: { fr: track }, automatic_captions: { en: track } }))
    const request = vi.fn(async () => new Response(JSON.stringify(caption)))
    const result = await new YouTubeTranscriptProvider({ run }, undefined, { fetch: request }).getTranscript(video)
    expect(result.source).toBe('official')
    expect(result.language).toBe('fr')
    expect(result.segments[0]!.start).toBe(1114)
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]).toEqual(['yt-dlp', expect.arrayContaining(['--ignore-config', '--no-playlist', '--', video.url]), { signal: undefined }])
  })

  it('recovers from a manual-caption HTTP failure with automatic captions', async () => {
    const run = vi.fn(async () => metadata({ subtitles: { en: track }, automatic_captions: { en: track } }))
    const request = vi.fn().mockResolvedValueOnce(new Response('blocked', { status: 403 })).mockResolvedValueOnce(new Response(JSON.stringify(caption)))
    expect((await new YouTubeTranscriptProvider({ run }, undefined, { fetch: request }).getTranscript(video)).source).toBe('automatic')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('recovers timestamped captions through the compatible extractor and removes temporary files', async () => {
    let temporary = ''
    const run = vi.fn(async (_executable: string, args: string[], options: { cwd?: string } = {}) => {
      if (args.includes('--dump-single-json'))
        return metadata()
      temporary = options.cwd!
      await writeFile(join(temporary, 'captions.en.json3'), JSON.stringify(caption))
      return ''
    })
    const result = await new YouTubeTranscriptProvider({ run }).getTranscript(video)
    expect(result.source).toBe('extractor')
    expect(result.segments[0]!.start).toBe(1114)
    await expect(access(temporary)).rejects.toThrow()
  })

  it('does not fetch arbitrary subtitle destinations returned by an extractor', async () => {
    const run = vi.fn().mockResolvedValueOnce(metadata({ subtitles: { en: [{ ext: 'json3', url: 'http://127.0.0.1/private' }] } })).mockResolvedValue('')
    const request = vi.fn()
    await expect(new YouTubeTranscriptProvider({ run }, undefined, { fetch: request }).getTranscript(video)).rejects.toThrow('NO_SUBTITLES')
    expect(request).not.toHaveBeenCalled()
  })

  it('reports videos without subtitles when no transcription recipient is selected', async () => {
    const run = vi.fn().mockResolvedValueOnce(metadata()).mockResolvedValue('')
    await expect(new YouTubeTranscriptProvider({ run }).getTranscript(video)).rejects.toThrow('NO_SUBTITLES')
  })

  it('transcribes chunked audio after subtitle failure and offsets timestamps', async () => {
    let temporary = ''
    const run = vi.fn(async (executable: string, args: string[], options: { cwd?: string } = {}) => {
      if (args.includes('--dump-single-json'))
        return metadata()
      temporary = options.cwd!
      if (args.includes('bestaudio'))
        await writeFile(join(temporary, 'source.webm'), 'fixture audio')
      if (executable === 'ffmpeg') {
        await writeFile(join(temporary, 'chunk-000.m4a'), 'first chunk')
        await writeFile(join(temporary, 'chunk-001.m4a'), 'second chunk')
      }
      return ''
    })
    const transcription: TranscriptionProvider = { transcribe: vi.fn(async () => [{ start: 2, end: 8, text: 'Audio evidence' }]) }
    const result = await new YouTubeTranscriptProvider({ run }, transcription).getTranscript(video)
    expect(result.source).toBe('transcription')
    expect(result.segments.map(segment => segment.start)).toEqual([2, 602])
    expect(transcription.transcribe).toHaveBeenCalledTimes(2)
    await expect(access(temporary)).rejects.toThrow()
  })

  it('rejects unknown audio duration before downloading or uploading', async () => {
    const run = vi.fn().mockResolvedValueOnce(metadata({ duration: null })).mockResolvedValue('')
    const transcribe = vi.fn()
    await expect(new YouTubeTranscriptProvider({ run }, { transcribe }).getTranscript(video)).rejects.toThrow('known duration')
    expect(run).toHaveBeenCalledTimes(2)
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('does not extract an invalid URL or accept another video', async () => {
    const run = vi.fn(async () => metadata({ id: 'aaaaaaaaaaa' }))
    const provider = new YouTubeTranscriptProvider({ run })
    await expect(provider.getTranscript({ ...video, url: 'https://evil.test/video' })).rejects.toThrow('INVALID_URL')
    expect(run).not.toHaveBeenCalled()
    await expect(provider.getTranscript(video)).rejects.toThrow('another video')
  })
})
