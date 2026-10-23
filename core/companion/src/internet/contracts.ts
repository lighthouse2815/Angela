import * as v from 'valibot'

export const secondsSchema = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(86400))
export const segmentSchema = v.pipe(v.object({
  start: secondsSchema,
  end: secondsSchema,
  text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(8000)),
}), v.check(segment => segment.end > segment.start))

/** All media positions use seconds. A missing playback position is never inferred from a URL. */
export interface VideoContext {
  url: string
  videoId: string
  title: string
  currentTime: number | null
  duration: number | null
  platform: 'youtube'
}

export type TranscriptSegment = v.InferOutput<typeof segmentSchema>

export const transcriptSchema = v.object({
  version: v.literal(1),
  videoId: v.pipe(v.string(), v.regex(/^[\w-]{11}$/u)),
  title: v.pipe(v.string(), v.maxLength(1000)),
  duration: v.nullable(secondsSchema),
  language: v.pipe(v.string(), v.maxLength(100)),
  source: v.picklist(['official', 'automatic', 'extractor', 'transcription']),
  generatedAt: v.pipe(v.number(), v.finite(), v.minValue(0)),
  segments: v.pipe(v.array(segmentSchema), v.minLength(1), v.maxLength(50000)),
})

/** Cached evidence contains no cookies, signed media URLs, or provider credentials. */
export type Transcript = v.InferOutput<typeof transcriptSchema>

/** Tool results retain provenance and report omitted segments explicitly. */
export interface LessonContext {
  video: VideoContext
  transcript: Pick<Transcript, 'language' | 'source' | 'generatedAt'>
  recentSegments: TranscriptSegment[]
  range: { start: number, end: number }
  truncated: boolean
  nextTimestamp: number | null
}

/** Providers return complete timestamped evidence. Failed or empty results are never cached. */
export interface TranscriptProvider {
  getTranscript: (video: VideoContext, signal?: AbortSignal) => Promise<Transcript>
}

/** The host chooses one audio recipient. Implementations must not silently switch providers. */
export interface TranscriptionProvider {
  transcribe: (audio: Uint8Array, signal?: AbortSignal) => Promise<TranscriptSegment[]>
}

/** Browser adapters observe only the browser already connected through Angela's permission boundary. */
export interface BrowserContextProvider {
  getActiveTab: () => Promise<{ url: string, title: string }>
  getActiveMediaContext: () => Promise<VideoContext>
}

/** A summary model receives bounded evidence, never a full long transcript in one request. */
export interface VideoSummarizer {
  summarize: (evidence: string, signal?: AbortSignal) => Promise<string>
}

/** Stable codes cross IPC. Raw process output and HTTP bodies never cross this boundary. */
export class InternetError extends Error {
  constructor(readonly code: 'INVALID_URL' | 'UNAVAILABLE' | 'NO_SUBTITLES' | 'NEED_SETUP' | 'PROVIDER_FAILED' | 'LIMIT_EXCEEDED' | 'CANCELLED', message: string) {
    super(`${code}: ${message}`)
    this.name = 'InternetError'
  }
}

/**
 * Removes tracking, playlist, and credential material before URLs reach executables or caches.
 *
 * @example
 * parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=30').url
 * // => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
 */
export function parseYouTubeUrl(input: string): VideoContext {
  try {
    const url = new URL(input)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
      throw new Error('Invalid YouTube URL.')
    let id: string | undefined | null
    if (url.hostname === 'youtu.be') {
      id = /^\/([\w-]{11})\/?$/u.exec(url.pathname)?.[1]
    }
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/u.exec(url.pathname)?.[1]
    }
    if (!id || !/^[\w-]{11}$/u.test(id))
      throw new Error('Invalid YouTube URL.')
    return { url: `https://www.youtube.com/watch?v=${id}`, videoId: id, title: '', currentTime: null, duration: null, platform: 'youtube' }
  }
  catch {
    throw new InternetError('INVALID_URL', 'Use a YouTube video URL.')
  }
}
