// Derived in part from Agent-Reach. MIT. See THIRD_PARTY_NOTICES.md.
import type { Transcript, TranscriptionProvider, TranscriptProvider, TranscriptSegment, VideoContext } from './contracts'
import type { MediaProcess } from './process'

import { chmod, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as v from 'valibot'

import { InternetError, parseYouTubeUrl, secondsSchema, segmentSchema } from './contracts'
import { readProviderText } from './http'
import { extractorArgs } from './process'

const trackSchema = v.object({ url: v.string(), ext: v.string() })
const metadataSchema = v.object({
  id: v.string(),
  title: v.optional(v.pipe(v.string(), v.maxLength(1000)), ''),
  duration: v.nullish(secondsSchema),
  subtitles: v.optional(v.record(v.string(), v.array(trackSchema)), () => ({})),
  automatic_captions: v.optional(v.record(v.string(), v.array(trackSchema)), () => ({})),
})
const captionsSchema = v.object({ events: v.array(v.object({
  tStartMs: v.optional(v.number()),
  dDurationMs: v.optional(v.number()),
  segs: v.optional(v.array(v.object({ utf8: v.string() }))),
})) })

/**
 * Keeps JSON3 cue timing and removes adjacent rolling-caption repeats.
 *
 * @example
 * parseCaptionJson({ events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] }] })
 * // => [{ start: 1, end: 3, text: 'Hello' }]
 */
export function parseCaptionJson(input: unknown): TranscriptSegment[] {
  const { events } = v.parse(captionsSchema, input)
  const segments: TranscriptSegment[] = []
  for (const event of events) {
    const text = event.segs?.map(segment => segment.utf8).join('').replace(/\s+/gu, ' ').trim()
    if (!text || event.tStartMs === undefined || event.dDurationMs === undefined || event.dDurationMs <= 0)
      continue
    const segment = v.parse(segmentSchema, { start: event.tStartMs / 1000, end: (event.tStartMs + event.dDurationMs) / 1000, text })
    const previous = segments.at(-1)
    if (previous?.text === text && previous.end >= segment.start)
      previous.end = Math.max(previous.end, segment.end)
    else
      segments.push(segment)
  }
  return segments
}

/**
 * Extracts only public YouTube media. Precedence is manual JSON3, automatic JSON3, extractor files, then audio transcription.
 * Temporary files belong to one request and are removed after success, cancellation, or failure.
 */
export class YouTubeTranscriptProvider implements TranscriptProvider {
  constructor(
    private readonly process: MediaProcess,
    private readonly transcription?: TranscriptionProvider,
    private readonly options: { executable?: string, ffmpeg?: string, languages?: string[], fetch?: typeof fetch } = {},
  ) {}

  private get executable() { return this.options.executable ?? 'yt-dlp' }

  async getTranscript(input: VideoContext, signal?: AbortSignal): Promise<Transcript> {
    const video = parseYouTubeUrl(input.url)
    const metadata = v.parse(metadataSchema, JSON.parse(await this.process.run(this.executable, [
      ...extractorArgs,
      '--dump-single-json',
      '--skip-download',
      '--',
      video.url,
    ], { signal })))
    if (metadata.id !== video.videoId)
      throw new InternetError('PROVIDER_FAILED', 'Extractor returned another video.')
    const base = { version: 1 as const, videoId: video.videoId, title: metadata.title, duration: metadata.duration ?? null, generatedAt: Date.now() }
    const languages = this.options.languages ?? ['vi', 'en', 'en-orig']
    // Manual captions remain preferred even when automatic captions match a preferred language more closely.
    for (const [source, tracks] of [['official', metadata.subtitles], ['automatic', metadata.automatic_captions]] as const) {
      const codes = Object.keys(tracks).sort((a, b) => {
        const rank = (language: string) => {
          const index = languages.findIndex(preferred => language === preferred || language.startsWith(`${preferred}-`))
          return index < 0 ? languages.length : index
        }
        return rank(a) - rank(b) || a.localeCompare(b)
      })
      for (const language of codes.slice(0, 3)) {
        const track = tracks[language]!.find(track => track.ext === 'json3')
        if (!track)
          continue
        try {
          const url = new URL(track.url)
          if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext' || url.username || url.password || url.port)
            continue
          const response = await (this.options.fetch ?? fetch)(url, {
            redirect: 'error',
            credentials: 'omit',
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
          })
          const segments = parseCaptionJson(JSON.parse(await readProviderText(response)))
          if (segments.length)
            return { ...base, language, source, segments }
        }
        catch {
          signal?.throwIfAborted()
          // Extractor-file recovery handles timed-text URLs that expire or reject this HTTP client.
        }
      }
    }

    const directory = await mkdtemp(join(tmpdir(), 'angela-video-'))
    try {
      await chmod(directory, 0o700)
      try {
        await this.process.run(this.executable, [
          ...extractorArgs,
          '--skip-download',
          '--write-subs',
          '--write-auto-subs',
          '--sub-langs',
          languages.join(','),
          '--sub-format',
          'json3',
          '-o',
          'captions.%(ext)s',
          '--',
          video.url,
        ], { cwd: directory, signal })
        const files = (await readdir(directory)).filter(name => /^captions\.[\w-]+\.json3$/u.test(name)).sort((a, b) => {
          const rank = (name: string) => {
            const index = languages.indexOf(name.split('.')[1]!)
            return index < 0 ? languages.length : index
          }
          return rank(a) - rank(b) || a.localeCompare(b)
        })
        for (const name of files) {
          const path = join(directory, name)
          if ((await stat(path)).size > 8 * 1024 * 1024)
            continue
          const segments = parseCaptionJson(JSON.parse(await readFile(path, 'utf8')))
          if (segments.length)
            return { ...base, language: name.split('.')[1]!, source: 'extractor', segments }
        }
      }
      catch {
        signal?.throwIfAborted()
        // Audio is the last evidence source, only after subtitle retrieval fails.
      }
      if (!this.transcription)
        throw new InternetError('NO_SUBTITLES', 'Subtitles are unavailable. Select an audio transcription provider for fallback.')
      const segments = await this.transcribe(video, metadata.duration, directory, signal)
      return { ...base, language: 'und', source: 'transcription', segments }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  private async transcribe(video: VideoContext, duration: number | null | undefined, directory: string, signal?: AbortSignal) {
    // Probe metadata before downloading. The four-hour ceiling bounds disk use and paid transcription requests.
    if (!duration || duration > 14400)
      throw new InternetError('LIMIT_EXCEEDED', 'Audio transcription requires a known duration of at most four hours.')
    await this.process.run(this.executable, [
      ...extractorArgs,
      '-f',
      'bestaudio',
      '--max-filesize',
      '512M',
      '-o',
      'source.%(ext)s',
      '--',
      video.url,
    ], { cwd: directory, signal, timeout: 600000 })
    const files = (await readdir(directory)).filter(name => /^source\.[a-z0-9]+$/u.test(name))
    if (files.length !== 1 || (await stat(join(directory, files[0]!))).size > 512 * 1024 * 1024)
      throw new InternetError('LIMIT_EXCEEDED', 'Audio extraction exceeded its source budget.')
    await this.process.run(this.options.ffmpeg ?? 'ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      join(directory, files[0]!),
      '-t',
      String(duration),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '32k',
      '-f',
      'segment',
      '-segment_time',
      '600',
      join(directory, 'chunk-%03d.m4a'),
    ], { cwd: directory, signal, timeout: 600000 })
    const chunks = (await readdir(directory)).filter(name => /^chunk-\d{3}\.m4a$/u.test(name)).sort()
    if (!chunks.length || chunks.length > 24 || chunks.length !== Math.ceil(duration / 600))
      throw new InternetError('LIMIT_EXCEEDED', 'Audio chunk count does not cover the expected video duration.')
    const segments: TranscriptSegment[] = []
    for (const [index, name] of chunks.entries()) {
      signal?.throwIfAborted()
      const path = join(directory, name)
      if ((await stat(path)).size > 24 * 1024 * 1024)
        throw new InternetError('LIMIT_EXCEEDED', 'Audio chunk exceeds the upload budget.')
      const result = await this.transcription!.transcribe(await readFile(path), signal)
      for (const segment of result) {
        if (segment.end > Math.min(600, duration - index * 600) + 1)
          throw new InternetError('PROVIDER_FAILED', 'Transcription timestamps exceed the audio chunk.')
        segments.push(v.parse(segmentSchema, { ...segment, start: segment.start + index * 600, end: segment.end + index * 600 }))
      }
    }
    return segments
  }
}
