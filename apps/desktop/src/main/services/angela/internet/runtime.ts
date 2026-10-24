import type { BrowserMediaContextProvider, TranscriptProvider, VideoSummarizer } from '@angela/companion/internet'

import type { InternetDiagnostic } from '../../../../shared/eventa/internet'
import type { McpManager } from '../mcp-servers'

import { InternetError, InternetService } from '@angela/companion/internet'
import { FileTranscriptCache } from '@angela/companion/internet/cache'
import { secondsSchema } from '@angela/companion/internet/contracts'

import * as v from 'valibot'

import { browserServerName } from '../../../../shared/browser-mcp'

const windowSchema = v.pipe(secondsSchema, v.maxValue(3600))
const requestSchema = v.object({
  action: v.picklist(['around', 'recent', 'search', 'transcript', 'summarize', 'summarize-recent']),
  url: v.optional(v.pipe(v.string(), v.maxLength(4096))),
  timestamp: v.optional(secondsSchema),
  beforeSeconds: v.optional(windowSchema),
  afterSeconds: v.optional(windowSchema),
  recentSeconds: v.optional(v.pipe(windowSchema, v.minValue(1))),
  query: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
})

/** Owns desktop lesson routing. The host supplies browser, extraction, summary, and shutdown boundaries. */
export class StudyAlongRuntime {
  private readonly service: InternetService
  private readonly cache: FileTranscriptCache

  constructor(
    provider: TranscriptProvider,
    cacheDirectory: string,
    private readonly browser: BrowserMediaContextProvider,
    private readonly summarizer: () => Promise<VideoSummarizer>,
    private readonly signal?: AbortSignal,
    ttlDays = () => 30,
  ) {
    this.cache = new FileTranscriptCache(cacheDirectory, Date.now, ttlDays)
    this.service = new InternetService(provider, this.cache, browser, undefined, signal)
  }

  async whenIdle() {
    await this.service.whenIdle()
  }

  async execute(input: unknown, signal?: AbortSignal) {
    signal = signal && this.signal ? AbortSignal.any([signal, this.signal]) : signal ?? this.signal
    signal?.throwIfAborted()
    const request = v.parse(requestSchema, input)
    let url = request.url
    let timestamp = request.timestamp
    if (!url) {
      const video = await this.browser.getActiveMediaContext()
      signal?.throwIfAborted()
      url = video.url
      timestamp ??= video.currentTime ?? undefined
    }
    if (request.action === 'search') {
      if (!request.query)
        throw new InternetError('INVALID_URL', 'Provide a literal transcript search query.')
      return this.service.searchTranscript(url, request.query, signal)
    }
    if (request.action === 'summarize') {
      return this.service.summarizeVideo(url, signal, await this.summarizer())
    }
    // Full evidence stays on disk. Transcript reads expose bounded windows with continuation metadata.
    if (request.action === 'transcript')
      return this.service.getTranscriptAround(url, timestamp ?? 0, 0, request.afterSeconds ?? 600, signal)
    if (timestamp === undefined)
      throw new InternetError('UNAVAILABLE', 'The lesson tab has no readable playback position. Provide an explicit timestamp.')
    if (request.action === 'summarize-recent') {
      return this.service.summarizeRecentVideoContext(url, timestamp, request.recentSeconds ?? 300, signal, await this.summarizer())
    }
    if (request.action === 'recent')
      return this.service.getTranscriptAround(url, timestamp, request.recentSeconds ?? 300, 0, signal)
    return this.service.getTranscriptAround(url, timestamp, request.beforeSeconds, request.afterSeconds, signal)
  }
}

/** Reports local readiness only. Browser observation and media extraction remain separate explicit operations. */
export async function diagnoseInternet(
  mcp: Pick<McpManager, 'getRuntimeStatus'>,
  checkExecutable: (name: 'extractor' | 'ffmpeg') => Promise<boolean>,
  transcriptionConfigured: () => Promise<boolean>,
): Promise<InternetDiagnostic[]> {
  const browser = mcp.getRuntimeStatus().servers.find(server => server.name === browserServerName)
  const [extractor, ffmpeg, transcription] = await Promise.all([checkExecutable('extractor'), checkExecutable('ffmpeg'), transcriptionConfigured()])
  return [
    { capability: 'Browser Context', status: browser?.state === 'running' ? 'READY' : 'NEED_SETUP', detail: 'Uses the current tab of the connected Angela Browser. Playback observation is checked when requested.' },
    { capability: 'YouTube Metadata', status: extractor ? 'UNVERIFIED' : 'NEED_SETUP', detail: 'Extractor availability is checked locally. Public video access requires an extraction request.' },
    { capability: 'YouTube Transcript', status: extractor ? 'UNVERIFIED' : 'NEED_SETUP', detail: 'Manual captions, automatic captions, extractor recovery, then explicitly configured transcription.' },
    { capability: 'Audio Transcription', status: extractor && ffmpeg && transcription ? 'UNVERIFIED' : 'NEED_SETUP', detail: 'Requires the extractor, FFmpeg, and an explicitly selected timestamp-capable provider. No audio was uploaded by diagnostics.' },
    { capability: 'GitHub', status: 'NOT_INTEGRATED', detail: 'Use existing browser research for public repositories.' },
    { capability: 'Web Search', status: 'NOT_INTEGRATED', detail: 'The existing Tavily capability owns its settings and readiness.' },
    ...['Reddit', 'Twitter/X', 'Bilibili', 'Xiaohongshu', 'RSS'].map(capability => ({ capability, status: 'NOT_INTEGRATED' as const, detail: 'No native authenticated provider was added. Existing browser tools remain available.' })),
  ]
}
