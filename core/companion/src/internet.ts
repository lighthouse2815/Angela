import type { BrowserMediaContextProvider, LessonContext, Transcript, TranscriptProvider, VideoSummarizer } from './internet/contracts'

import * as v from 'valibot'

import { InternetError, parseYouTubeUrl, secondsSchema, transcriptSchema } from './internet/contracts'

export type { BrowserContextProvider, BrowserMediaContextProvider, LessonContext, Transcript, TranscriptionProvider, TranscriptProvider, TranscriptSegment, VideoContext, VideoSummarizer } from './internet/contracts'
export { InternetError, parseYouTubeUrl } from './internet/contracts'

/** Storage implementations own expiry, capacity, and private persistence. */
export interface TranscriptCache {
  get: (videoId: string) => Promise<Transcript | undefined>
  set: (transcript: Transcript) => Promise<void>
}

/**
 * Owns per-video request coalescing. Complete transcripts live in the cache, bounded excerpts enter chat.
 * Shutdown cancellation belongs to the host signal. Failed requests leave no reusable pending state.
 */
export class InternetService {
  private readonly pending = new Map<string, Promise<Transcript>>()

  constructor(
    private readonly provider: TranscriptProvider,
    private readonly cache: TranscriptCache,
    private readonly browser?: BrowserMediaContextProvider,
    private readonly summarizer?: VideoSummarizer,
    private readonly signal?: AbortSignal,
  ) {}

  async getTranscript(url: string): Promise<Transcript> {
    this.signal?.throwIfAborted()
    const video = parseYouTubeUrl(url)
    const cached = await this.cache.get(video.videoId)
    // Only complete, unexpired transcripts are returned by the cache boundary.
    if (cached)
      return structuredClone(cached)
    let pending = this.pending.get(video.videoId)
    if (!pending) {
      if (this.pending.size >= 4)
        throw new InternetError('LIMIT_EXCEEDED', 'Wait for pending video requests to finish.')
      pending = this.load(video.url).finally(() => this.pending.delete(video.videoId))
      this.pending.set(video.videoId, pending)
    }
    return structuredClone(await pending)
  }

  private async load(url: string) {
    const video = parseYouTubeUrl(url)
    const transcript = v.parse(transcriptSchema, await this.provider.getTranscript(video, this.signal))
    if (transcript.videoId !== video.videoId)
      throw new InternetError('PROVIDER_FAILED', 'Transcript belongs to another video.')
    transcript.segments.sort((a, b) => a.start - b.start || a.end - b.end)
    this.signal?.throwIfAborted()
    await this.cache.set(transcript)
    return transcript
  }

  /** The default window is 90 seconds before and 60 seconds after playback. */
  async getTranscriptAround(url: string, timestamp: number, beforeSeconds = 90, afterSeconds = 60): Promise<LessonContext> {
    v.parse(secondsSchema, timestamp)
    const window = v.pipe(secondsSchema, v.maxValue(3600))
    v.parse(window, beforeSeconds)
    v.parse(window, afterSeconds)
    if (beforeSeconds + afterSeconds === 0)
      throw new InternetError('INVALID_URL', 'Choose a non-empty transcript window.')
    return this.excerpt(url, timestamp, Math.max(0, timestamp - beforeSeconds), timestamp + afterSeconds)
  }

  private async excerpt(url: string, timestamp: number, start: number, end: number): Promise<LessonContext> {
    const transcript = await this.getTranscript(url)
    if (transcript.duration !== null && timestamp > transcript.duration)
      throw new InternetError('UNAVAILABLE', 'Playback position exceeds the video duration.')
    const candidates = transcript.segments.filter(segment => segment.end > start && segment.start < end)
    const recentSegments: Transcript['segments'] = []
    let length = 0
    for (const segment of candidates) {
      if (recentSegments.length === 200 || length + segment.text.length > 24000)
        break
      recentSegments.push(segment)
      length += segment.text.length
    }
    const truncated = recentSegments.length < candidates.length
    return {
      video: { ...parseYouTubeUrl(url), title: transcript.title, duration: transcript.duration, currentTime: timestamp },
      transcript: { language: transcript.language, source: transcript.source, generatedAt: transcript.generatedAt },
      recentSegments,
      range: { start, end: Math.min(end, transcript.duration ?? end) },
      truncated,
      nextTimestamp: truncated ? candidates[recentSegments.length]!.start : null,
    }
  }

  async searchTranscript(url: string, query: string) {
    const text = v.parse(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)), query).normalize('NFC').toLocaleLowerCase()
    const transcript = await this.getTranscript(url)
    const matches = transcript.segments.filter(segment => segment.text.normalize('NFC').toLocaleLowerCase().includes(text))
    return { video: { ...parseYouTubeUrl(url), title: transcript.title }, matches: matches.slice(0, 20), truncated: matches.length > 20 }
  }

  /** Reads the connected current tab at request time. Unknown playback positions fail instead of defaulting to zero. */
  async getActiveLessonContext(recentSeconds?: number) {
    if (!this.browser)
      throw new InternetError('NEED_SETUP', 'Connect Angela Browser to the lesson tab.')
    const video = await this.browser.getActiveMediaContext()
    if (video.currentTime === null)
      throw new InternetError('UNAVAILABLE', 'The active tab has no readable video playback position.')
    const lesson = await this.getTranscriptAround(video.url, video.currentTime, recentSeconds ?? 90, recentSeconds === undefined ? 60 : 0)
    lesson.video.title = video.title || lesson.video.title
    return lesson
  }

  async summarizeRecentVideoContext(url: string, timestamp: number, recentSeconds = 300) {
    const context = await this.getTranscriptAround(url, timestamp, recentSeconds, 0)
    if (!this.summarizer)
      throw new InternetError('NEED_SETUP', 'Select a chat model for video summaries.')
    if (!context.recentSegments.length || context.truncated)
      throw new InternetError('UNAVAILABLE', 'Recent transcript evidence is empty or incomplete.')
    const summary = await this.summarizer.summarize(JSON.stringify(context), this.signal)
    return { video: context.video, range: context.range, summary }
  }

  /** Summarizes consecutive bounded batches, then reduces their timestamped summaries in bounded groups. */
  async summarizeVideo(url: string) {
    if (!this.summarizer)
      throw new InternetError('NEED_SETUP', 'Select a chat model for video summaries.')
    const transcript = await this.getTranscript(url)
    const batches: string[] = []
    let batch = ''
    for (const segment of transcript.segments) {
      const line = JSON.stringify(segment)
      if (batch.length + line.length > 16000) {
        batches.push(batch)
        batch = ''
      }
      batch += `${line}\n`
    }
    if (batch)
      batches.push(batch)
    if (batches.length > 64)
      throw new InternetError('LIMIT_EXCEEDED', 'Video exceeds the 64-batch summary budget.')
    const summaries: string[] = []
    for (const evidence of batches) {
      this.signal?.throwIfAborted()
      summaries.push((await this.summarizer.summarize(evidence, this.signal)).slice(0, 4000))
    }
    while (summaries.length > 1) {
      const reduced: string[] = []
      for (let index = 0; index < summaries.length; index += 4)
        reduced.push((await this.summarizer.summarize(summaries.slice(index, index + 4).join('\n'), this.signal)).slice(0, 4000))
      summaries.splice(0, summaries.length, ...reduced)
    }
    return { video: { ...parseYouTubeUrl(url), title: transcript.title }, summary: summaries[0], source: transcript.source }
  }
}
