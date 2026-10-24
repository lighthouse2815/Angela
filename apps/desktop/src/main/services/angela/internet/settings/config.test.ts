import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LocalConfigFile } from '@angela/local-config/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultStudyAlongSettings } from '../../../../../shared/study-along'
import { StudyAlongConfig } from './config'

let directory: string
let providers: LocalConfigFile
let settings: StudyAlongConfig
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-study-settings-'))
  providers = new LocalConfigFile(join(directory, 'providers.json'))
  await providers.update({ providers: {
    cloud: { definitionId: 'openai-audio-transcription', status: 'configured', config: { apiKey: 'test-only-private-key', baseUrl: 'https://audio.example/v1/' } },
    compatible: { definitionId: 'openai-compatible-audio-transcription', status: 'configured', config: { apiKey: 'test-only-other-key', baseUrl: 'https://other.example/v1/' } },
    chat: { definitionId: 'openai', status: 'configured', config: { apiKey: 'test-only-chat-key' } },
  } })
  settings = new StudyAlongConfig(directory, providers)
})
afterEach(async () => rm(directory, { recursive: true, force: true }))

describe('private Study Along settings', () => {
  it('defaults to subtitles with disabled audio and no cloud upload consent', async () => {
    expect(await settings.read()).toEqual(defaultStudyAlongSettings)
    expect((await settings.selection()).allowCloudAudioUpload).toBe(false)
  })

  it('persists a local source without requiring a cloud account or installed model', async () => {
    await settings.save({ ...defaultStudyAlongSettings, transcriptionMode: 'local' })
    expect(await new StudyAlongConfig(directory, providers).read()).toMatchObject({ transcriptionMode: 'local', allowCloudAudioUpload: false })
  })

  it('selects an existing timestamp-capable cloud model without implicitly granting upload consent', async () => {
    await settings.save({ ...defaultStudyAlongSettings, transcriptionMode: 'cloud', cloudProviderId: 'cloud', cloudModel: 'whisper-1' })
    expect(await settings.selection()).toMatchObject({ cloudProviderId: 'cloud', allowCloudAudioUpload: false })
    expect(await settings.cloudConfig()).toEqual({ apiKey: 'test-only-private-key', baseUrl: 'https://audio.example/v1/', model: 'whisper-1' })
    expect(await readFile(join(directory, 'study-along.json'), 'utf8')).not.toContain('test-only-private-key')
  })

  it('returns redacted saved transcription choices, excluding unrelated chat providers', async () => {
    const choices = await settings.choices()
    expect(choices.map(choice => choice.id)).toEqual(['cloud', 'compatible'])
    expect(choices[0]).toMatchObject({ models: ['whisper-1'], customModel: false })
    expect(JSON.stringify(choices)).not.toMatch(/apiKey|test-only|baseUrl|audio\.example/u)
  })

  it('rejects missing providers and models that lose timestamp information', async () => {
    const selected = { ...defaultStudyAlongSettings, transcriptionMode: 'cloud', cloudProviderId: 'missing', cloudModel: 'whisper-1' }
    await expect(settings.save(selected)).rejects.toThrow('missing or unconfigured')
    await expect(settings.save({ ...selected, cloudProviderId: 'cloud', cloudModel: 'gpt-4o-transcribe' })).rejects.toThrow('timestamp-capable')
    await expect(settings.save({ ...selected, cloudProviderId: 'compatible', cloudModel: '' })).rejects.toThrow('timestamp-capable')
    await expect(settings.save({ ...selected, cloudProviderId: '' })).rejects.toThrow('Choose a saved')
  })

  it('allows cloud consent revocation after the selected provider has been removed', async () => {
    await settings.save({ ...defaultStudyAlongSettings, transcriptionMode: 'cloud', cloudProviderId: 'cloud', cloudModel: 'whisper-1', allowCloudAudioUpload: true })
    await providers.update({ providers: { cloud: null } })
    await settings.save({ ...await settings.read(), allowCloudAudioUpload: false })
    expect((await settings.selection()).allowCloudAudioUpload).toBe(false)
    await settings.save({ ...await settings.read(), enabled: false })
    expect((await settings.selection()).enabled).toBe(false)
  })

  it('supports compatible model IDs but rejects insecure saved endpoints', async () => {
    const selected = { ...defaultStudyAlongSettings, transcriptionMode: 'cloud', cloudProviderId: 'compatible', cloudModel: 'whisper-large-v3' }
    await settings.save(selected)
    expect((await settings.cloudConfig()).model).toBe('whisper-large-v3')
    await providers.update({ providers: { compatible: { definitionId: 'openai-compatible-audio-transcription', status: 'configured', config: { apiKey: 'test-only', baseUrl: 'http://127.0.0.1/v1/' } } } })
    await expect(settings.cloudConfig()).rejects.toThrow('HTTPS')
  })

  it('retains explicit local and disabled modes under advanced cloud overrides', async () => {
    const advanced = new StudyAlongConfig(directory, providers, { ANGELA_VIDEO_TRANSCRIPTION_PROVIDER: 'cloud', ANGELA_VIDEO_TRANSCRIPTION_MODEL: 'whisper-1' })
    expect(await advanced.selection()).toMatchObject({ transcriptionMode: 'disabled', allowCloudAudioUpload: false })
    await advanced.save({ ...defaultStudyAlongSettings, transcriptionMode: 'local' })
    expect(await advanced.selection()).toMatchObject({ transcriptionMode: 'local', cloudProviderId: '', allowCloudAudioUpload: false })
    await advanced.save({ ...defaultStudyAlongSettings, transcriptionMode: 'auto' })
    expect(await advanced.selection()).toMatchObject({ transcriptionMode: 'auto', cloudProviderId: 'cloud', allowCloudAudioUpload: false })
  })

  it('rejects unknown fields and invalid TTL without overwriting the saved choice', async () => {
    await expect(settings.save({ ...defaultStudyAlongSettings, apiKey: 'renderer-must-not-store-keys' })).rejects.toThrow('Invalid Study Along')
    await expect(settings.save({ ...defaultStudyAlongSettings, cacheTtlDays: 0 })).rejects.toThrow('1–90')
    expect(await settings.read()).toEqual(defaultStudyAlongSettings)
  })
})
