import type { TranscriptionProvider } from './contracts'

import process from 'node:process'

import { access, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { InternetService } from '../internet'
import { FileTranscriptCache } from './cache'
import { InternetError, parseYouTubeUrl } from './contracts'
import { MediaProcess } from './process'
import { TranscriptFallbackRouter } from './transcription-routing'
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
      if (executable === 'ffmpeg')
        await writeFile(args.at(-1)!, 'fixture encoded chunk')
      return ''
    })
    const transcription: TranscriptionProvider = { transcribe: vi.fn(async () => [{ start: 2, end: 8, text: 'Audio evidence' }]) }
    const result = await new YouTubeTranscriptProvider({ run }, transcription).getTranscript(video)
    expect(result.source).toBe('transcription')
    expect(result.segments.map(segment => segment.start)).toEqual([2, 602])
    expect(transcription.transcribe).toHaveBeenCalledTimes(2)
    const encodes = run.mock.calls.filter(call => call[0] === 'ffmpeg')
    expect(encodes).toHaveLength(2)
    expect(encodes[0]![1]).toEqual(expect.arrayContaining(['-ss', '0', '-t', '600']))
    expect(encodes[1]![1]).toEqual(expect.arrayContaining(['-ss', '600', '-t', '600']))
    await expect(access(temporary)).rejects.toThrow()
  })

  it('uses local transcription for a captionless lesson and caches the complete timestamped result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angela-local-cache-'))
    const run = vi.fn<MediaProcess['run']>(async (executable, args, options = {}) => {
      if (args.includes('--dump-single-json'))
        return metadata()
      if (args.includes('bestaudio'))
        await writeFile(join(options.cwd!, 'source.webm'), 'fixture audio')
      if (executable === 'ffmpeg')
        await writeFile(args.at(-1)!, 'fixture encoded chunk')
      return ''
    })
    const transcribe = vi.fn(async () => [{ start: 2, end: 8, text: 'Local evidence' }])
    const local = vi.fn(async () => ({ transcribe }))
    const cloud = vi.fn()
    const router = new TranscriptFallbackRouter(async () => ({ enabled: true, transcriptionMode: 'auto', allowCloudAudioUpload: false }), local, cloud)
    const cache = new FileTranscriptCache(directory)
    const service = new InternetService(new YouTubeTranscriptProvider({ run }, router), cache)
    try {
      const result = await service.getTranscript(video.url)
      expect(result.segments.map(segment => segment.start)).toEqual([2, 602])
      expect(result.source).toBe('transcription')
      await service.getTranscript(video.url)
      expect(local).toHaveBeenCalledOnce()
      expect(transcribe).toHaveBeenCalledTimes(2)
      expect(cloud).not.toHaveBeenCalled()
      // A later chunk failure leaves no partial reusable transcript.
      await rm(directory, { recursive: true, force: true })
      transcribe.mockResolvedValueOnce([{ start: 1, end: 2, text: 'First partial chunk' }]).mockRejectedValueOnce(new InternetError('PROVIDER_FAILED', 'Second chunk failed'))
      await expect(service.getTranscript(video.url)).rejects.toThrow('Second chunk failed')
      expect(await cache.get(video.videoId)).toBeUndefined()
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects missing local setup with cloud upload disabled before audio extraction', async () => {
    const run = vi.fn<MediaProcess['run']>(async (_executable, args) => args.includes('--dump-single-json') ? metadata() : '')
    const cloud = vi.fn()
    const router = new TranscriptFallbackRouter(async () => ({ enabled: true, transcriptionMode: 'auto', allowCloudAudioUpload: false }), async () => {
      throw new InternetError('NEED_SETUP', 'Install a local model')
    }, cloud)
    await expect(new YouTubeTranscriptProvider({ run }, router).getTranscript(video)).rejects.toThrow('upload is disabled')
    expect(cloud).not.toHaveBeenCalled()
    expect(run.mock.calls.some(call => call[1].includes('bestaudio'))).toBe(false)
  })

  it('rejects unknown audio duration before downloading or uploading', async () => {
    const run = vi.fn().mockResolvedValueOnce(metadata({ duration: null })).mockResolvedValue('')
    const transcribe = vi.fn()
    await expect(new YouTubeTranscriptProvider({ run }, { transcribe }).getTranscript(video)).rejects.toThrow('known duration')
    expect(run).toHaveBeenCalledTimes(2)
    expect(transcribe).not.toHaveBeenCalled()
  })

  it.runIf(process.env.ANGELA_TEST_FFMPEG)('encodes exactly one real audio interval at the 600-second AAC padding boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angela-aac-boundary-'))
    const ffmpeg = process.env.ANGELA_TEST_FFMPEG!
    const media = new MediaProcess()
    const source = join(directory, 'source.m4a')
    try {
      await media.run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '600', '-b:a', '32k', source])
      const run: MediaProcess['run'] = async (executable, args, options = {}) => {
        if (executable === ffmpeg)
          return media.run(executable, args, options)
        if (args.includes('--dump-single-json'))
          return metadata({ duration: 600 })
        if (args.includes('bestaudio'))
          await copyFile(source, join(options.cwd!, 'source.m4a'))
        return ''
      }
      const transcribe = vi.fn<TranscriptionProvider['transcribe']>(async audio => audio.length ? [{ start: 1, end: 2, text: 'Timestamped evidence' }] : [])
      const result = await new YouTubeTranscriptProvider({ run }, { transcribe }, { ffmpeg }).getTranscript(video)
      expect(result.source).toBe('transcription')
      expect(result.segments).toEqual([{ start: 1, end: 2, text: 'Timestamped evidence' }])
      expect(transcribe).toHaveBeenCalledOnce()
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not extract an invalid URL or accept another video', async () => {
    const run = vi.fn(async () => metadata({ id: 'aaaaaaaaaaa' }))
    const provider = new YouTubeTranscriptProvider({ run })
    await expect(provider.getTranscript({ ...video, url: 'https://evil.test/video' })).rejects.toThrow('INVALID_URL')
    expect(run).not.toHaveBeenCalled()
    await expect(provider.getTranscript(video)).rejects.toThrow('another video')
  })
})
