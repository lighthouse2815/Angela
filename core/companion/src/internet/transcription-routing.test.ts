import type { TranscriptionProvider } from './contracts'
import type { TranscriptionSelection } from './transcription-routing'

import { describe, expect, it, vi } from 'vitest'

import { InternetError } from './contracts'
import { TranscriptFallbackRouter } from './transcription-routing'

const localSegments = [{ start: 1, end: 3, text: 'Local evidence' }]
const cloudSegments = [{ start: 2, end: 4, text: 'Cloud evidence' }]

function routing(selection: TranscriptionSelection) {
  const local: TranscriptionProvider = { transcribe: vi.fn(async () => localSegments) }
  const cloud: TranscriptionProvider = { transcribe: vi.fn(async () => cloudSegments) }
  const localFactory = vi.fn(async () => local)
  const cloudFactory = vi.fn(async () => cloud)
  return { router: new TranscriptFallbackRouter(async () => selection, localFactory, cloudFactory), local, cloud, localFactory, cloudFactory }
}

describe('explicit transcription source and upload consent', () => {
  it('does not prepare a source when fallback is disabled', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'disabled', allowCloudAudioUpload: false })
    await expect(run.router.prepare()).rejects.toThrow('audio fallback is disabled')
    expect(run.localFactory).not.toHaveBeenCalled()
    expect(run.cloudFactory).not.toHaveBeenCalled()
  })

  it('selects local inference and never contacts cloud when local is preferred', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'auto', allowCloudAudioUpload: true })
    expect(await run.router.transcribe(new Uint8Array([1]))).toEqual(localSegments)
    expect(run.local.transcribe).toHaveBeenCalledOnce()
    expect(run.cloudFactory).not.toHaveBeenCalled()
    expect(run.cloud.transcribe).not.toHaveBeenCalled()
  })

  it('honors an explicit cloud preference after consent', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'cloud', allowCloudAudioUpload: true })
    expect(await run.router.transcribe(new Uint8Array([1]))).toEqual(cloudSegments)
    expect(run.localFactory).not.toHaveBeenCalled()
    expect(run.cloud.transcribe).toHaveBeenCalledOnce()
  })

  it('scenario C: local is unavailable and upload is disabled, so no cloud request exists', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'auto', allowCloudAudioUpload: false })
    run.localFactory.mockRejectedValue(new InternetError('NEED_SETUP', 'No local model'))
    await expect(run.router.transcribe(new Uint8Array([1]))).rejects.toThrow('Cloud audio upload is disabled')
    expect(run.cloudFactory).not.toHaveBeenCalled()
    expect(run.cloud.transcribe).not.toHaveBeenCalled()
  })

  it('uses cloud after missing local setup only when upload consent exists', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'auto', allowCloudAudioUpload: true })
    run.localFactory.mockRejectedValue(new InternetError('UNAVAILABLE', 'No local runtime'))
    expect(await run.router.transcribe(new Uint8Array([1]))).toEqual(cloudSegments)
  })

  it('does not switch recipients after a selected local inference failure', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'auto', allowCloudAudioUpload: true })
    vi.mocked(run.local.transcribe).mockRejectedValue(new InternetError('PROVIDER_FAILED', 'Local inference failed'))
    await expect(run.router.transcribe(new Uint8Array([1]))).rejects.toThrow('Local inference failed')
    expect(run.cloudFactory).not.toHaveBeenCalled()
  })

  it('rechecks consent before each upload even after a video source was prepared', async () => {
    const selection: TranscriptionSelection = { enabled: true, transcriptionMode: 'cloud', allowCloudAudioUpload: true }
    const run = routing(selection)
    const prepared = await run.router.prepare()
    selection.allowCloudAudioUpload = false
    await expect(prepared.transcribe(new Uint8Array([1]))).rejects.toThrow('permission was revoked')
    expect(run.cloud.transcribe).not.toHaveBeenCalled()
  })

  it('keeps explicit local-only selection local when setup is missing', async () => {
    const run = routing({ enabled: true, transcriptionMode: 'local', allowCloudAudioUpload: true })
    run.localFactory.mockRejectedValue(new InternetError('NEED_SETUP', 'Install local model'))
    await expect(run.router.prepare()).rejects.toThrow('Install local model')
    expect(run.cloudFactory).not.toHaveBeenCalled()
  })
})
