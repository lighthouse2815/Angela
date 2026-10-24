import type { TranscriptionProvider } from './contracts'

import { InternetError } from './contracts'

/** Local-first is explicit. Cloud upload consent remains mandatory even when advanced overrides choose a cloud provider. */
export interface TranscriptionSelection {
  enabled: boolean
  transcriptionMode: 'disabled' | 'local' | 'cloud' | 'auto'
  allowCloudAudioUpload: boolean
}

/** Chooses a source before audio extraction. A prepared video retains its source and rechecks cloud consent before every upload. */
export class TranscriptFallbackRouter implements TranscriptionProvider {
  constructor(
    private readonly selection: () => Promise<TranscriptionSelection>,
    private readonly local: (signal?: AbortSignal) => Promise<TranscriptionProvider>,
    private readonly cloud: (signal?: AbortSignal) => Promise<TranscriptionProvider>,
  ) {}

  async prepare(signal?: AbortSignal): Promise<TranscriptionProvider> {
    signal?.throwIfAborted()
    const selection = await this.selection()
    if (!selection.enabled || selection.transcriptionMode === 'disabled')
      throw new InternetError('NO_SUBTITLES', 'Subtitles are unavailable and audio fallback is disabled. Choose a transcription source in Study Along settings.')
    if (selection.transcriptionMode === 'local')
      return this.local(signal)
    if (selection.transcriptionMode === 'auto') {
      try {
        return await this.local(signal)
      }
      catch (error) {
        signal?.throwIfAborted()
        if (!(error instanceof InternetError) || !['NEED_SETUP', 'UNAVAILABLE'].includes(error.code))
          throw error
        // Only missing local setup selects the explicitly permitted cloud path. Inference failure never changes the audio recipient.
      }
    }
    if (!selection.allowCloudAudioUpload)
      throw new InternetError('NEED_SETUP', 'Cloud audio upload is disabled. Install a local model or explicitly allow cloud fallback in Study Along settings.')
    const provider = await this.cloud(signal)
    return {
      transcribe: async (audio, uploadSignal) => {
        const current = await this.selection()
        if (!current.enabled || !current.allowCloudAudioUpload || !['cloud', 'auto'].includes(current.transcriptionMode))
          throw new InternetError('NEED_SETUP', 'Cloud audio upload permission was revoked.')
        return provider.transcribe(audio, uploadSignal)
      },
    }
  }

  async transcribe(audio: Uint8Array, signal?: AbortSignal) {
    return (await this.prepare(signal)).transcribe(audio, signal)
  }
}
