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
 * Each caller can cancel independently. Extraction stops when its last caller leaves or the host shuts down.
 */
export class InternetService {
  private readonly pending = new Map<string, { promise: Promise<Transcript>, abort: AbortController, users: number, settled: boolean }>()
  private readonly inFlight = new Set<Promise<Transcript>>()

  constructor(
    private readonly provider: TranscriptProvider,
    private readonly cache: TranscriptCache,
    private readonly browser?: BrowserMediaContextProvider,
    private readonly summarizer?: VideoSummarizer,
    private readonly signal?: AbortSignal,
  ) {}

  private operationSignal(signal?: AbortSignal) {
    return signal && this.signal ? AbortSignal.any([signal, this.signal]) : signal ?? this.signal
  }

  async getTranscript(url: string, signal?: AbortSignal): Promise<Transcript> {
    const caller = this.operationSignal(signal)
    caller?.throwIfAborted()
    const video = parseYouTubeUrl(url)
    const cached = await this.cache.get(video.videoId)
    caller?.throwIfAborted()
    // Only complete, unexpired transcripts are returned by the cache boundary.
    if (cached)
      return structuredClone(cached)
    let pending = this.pending.get(video.videoId)
    if (!pending) {
      if (this.inFlight.size >= 4)
        throw new InternetError('LIMIT_EXCEEDED', 'Wait for pending video requests to finish.')
      const abort = new AbortController()
      const operation = { abort, users: 0, settled: false, promise: this.load(video.url, this.operationSignal(abort.signal)) }
      operation.promise = operation.promise.finally(() => {
        operation.settled = true
        if (this.pending.get(video.videoId) === operation)
          this.pending.delete(video.videoId)
        this.inFlight.delete(operation.promise)
      })
      this.inFlight.add(operation.promise)
      this.pending.set(video.videoId, operation)
      pending = operation
    }
    const operation = pending
    operation.users++
    return new Promise<Transcript>((resolve, reject) => {
      let finished = false
      const finish = (complete: () => void) => {
        if (finished)
          return
        finished = true
        caller?.removeEventListener('abort', cancel)
        operation.users--
        if (!operation.users && !operation.settled) {
          if (this.pending.get(video.videoId) === operation)
            this.pending.delete(video.videoId)
          operation.abort.abort()
        }
        complete()
      }
      function cancel() {
        finish(() => reject(new InternetError('CANCELLED', 'Video request was cancelled.')))
      }
      caller?.addEventListener('abort', cancel, { once: true })
      operation.promise.then(value => finish(() => resolve(structuredClone(value))), error => finish(() => reject(error)))
      if (caller?.aborted)
        cancel()
    })
  }

  private async load(url: string, signal?: AbortSignal) {
    const video = parseYouTubeUrl(url)
    const transcript = v.parse(transcriptSchema, await this.provider.getTranscript(video, signal))
    if (transcript.videoId !== video.videoId)
      throw new InternetError('PROVIDER_FAILED', 'Transcript belongs to another video.')
    transcript.segments.sort((a, b) => a.start - b.start || a.end - b.end)
    signal?.throwIfAborted()
    await this.cache.set(transcript)
    return transcript
  }

  /** Waits for owned extraction cleanup, including operations whose last caller already cancelled. */
  async whenIdle() {
    await Promise.allSettled(this.inFlight)
  }

  /** The default window is 90 seconds before and 60 seconds after playback. */
  async getTranscriptAround(url: string, timestamp: number, beforeSeconds = 90, afterSeconds = 60, signal?: AbortSignal): Promise<LessonContext> {
    v.parse(secondsSchema, timestamp)
    const window = v.pipe(secondsSchema, v.maxValue(3600))
    v.parse(window, beforeSeconds)
    v.parse(window, afterSeconds)
    if (beforeSeconds + afterSeconds === 0)
      throw new InternetError('INVALID_URL', 'Choose a non-empty transcript window.')
    return this.excerpt(url, timestamp, Math.max(0, timestamp - beforeSeconds), timestamp + afterSeconds, signal)
  }

  private async excerpt(url: string, timestamp: number, start: number, end: number, signal?: AbortSignal): Promise<LessonContext> {
    const transcript = await this.getTranscript(url, signal)
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

  async searchTranscript(url: string, query: string, signal?: AbortSignal) {
    const text = v.parse(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)), query).normalize('NFC').toLocaleLowerCase()
    const transcript = await this.getTranscript(url, signal)
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

  async summarizeRecentVideoContext(url: string, timestamp: number, recentSeconds = 300, signal?: AbortSignal, summarizer = this.summarizer) {
    const context = await this.getTranscriptAround(url, timestamp, recentSeconds, 0, signal)
    if (!summarizer)
      throw new InternetError('NEED_SETUP', 'Select a chat model for video summaries.')
    if (!context.recentSegments.length || context.truncated)
      throw new InternetError('UNAVAILABLE', 'Recent transcript evidence is empty or incomplete.')
    const summary = await summarizer.summarize(JSON.stringify(context), this.operationSignal(signal))
    return { video: context.video, range: context.range, summary }
  }

  /** Summarizes consecutive bounded batches, then reduces their timestamped summaries in bounded groups. */
  async summarizeVideo(url: string, signal?: AbortSignal, summarizer = this.summarizer) {
    if (!summarizer)
      throw new InternetError('NEED_SETUP', 'Select a chat model for video summaries.')
    const transcript = await this.getTranscript(url, signal)
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
      this.operationSignal(signal)?.throwIfAborted()
      summaries.push((await summarizer.summarize(evidence, this.operationSignal(signal))).slice(0, 4000))
    }
    while (summaries.length > 1) {
      const reduced: string[] = []
      for (let index = 0; index < summaries.length; index += 4)
        reduced.push((await summarizer.summarize(summaries.slice(index, index + 4).join('\n'), this.operationSignal(signal))).slice(0, 4000))
      summaries.splice(0, summaries.length, ...reduced)
    }
    return { video: { ...parseYouTubeUrl(url), title: transcript.title }, summary: summaries[0], source: transcript.source }
  }
}
