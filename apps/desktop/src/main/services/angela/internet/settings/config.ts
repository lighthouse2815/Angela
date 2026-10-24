import type { TranscriptionConfig } from '@angela/companion/internet/transcription'
import type { LocalConfigFile } from '@angela/local-config/node'

import type { SavedTranscriptionChoice, StudyAlongSettings } from '../../../../../shared/study-along'

import { InternetError } from '@angela/companion/internet'
import { MemoryFile } from '@angela/companion/memory-file'

import * as v from 'valibot'

import { defaultStudyAlongSettings, studyAlongSettingsSchema } from '../../../../../shared/study-along'

const compatibleDefinitions = ['openai-audio-transcription', 'openai-compatible-audio-transcription']
const modelSchema = v.pipe(v.string(), v.trim(), v.regex(/^[\w./:-]{1,128}$/u))

/** Reuses saved provider configuration. The settings file stores no credentials, endpoints, or model paths. */
export class StudyAlongConfig {
  private readonly file: MemoryFile<StudyAlongSettings>
  private current = { ...defaultStudyAlongSettings }

  constructor(directory: string, private readonly providers: Pick<LocalConfigFile, 'read'>, private readonly env: NodeJS.ProcessEnv = {}) {
    this.file = new MemoryFile(directory, 'study-along', studyAlongSettingsSchema, () => ({ ...defaultStudyAlongSettings }), { invalid: 'Invalid Study Along settings.', locked: 'Study Along settings are busy.' })
  }

  async read() {
    this.current = await this.file.read()
    return { ...this.current }
  }

  ttlDays = () => this.current.cacheTtlDays

  async selection() {
    const settings = await this.read()
    // Overrides select an existing cloud source. They never grant upload consent or enable a disabled fallback.
    if (this.env.ANGELA_VIDEO_TRANSCRIPTION_PROVIDER && settings.transcriptionMode !== 'disabled' && settings.transcriptionMode !== 'local')
      settings.cloudProviderId = this.env.ANGELA_VIDEO_TRANSCRIPTION_PROVIDER
    if (this.env.ANGELA_VIDEO_TRANSCRIPTION_MODEL)
      settings.cloudModel = this.env.ANGELA_VIDEO_TRANSCRIPTION_MODEL
    return settings
  }

  async save(input: unknown) {
    const parsed = v.safeParse(studyAlongSettingsSchema, input)
    if (!parsed.success)
      throw new InternetError('NEED_SETUP', 'Invalid Study Along settings. Choose a supported mode and a cache lifetime of 1–90 days.')
    const settings = parsed.output
    const previous = await this.file.read()
    const revoking = !settings.enabled || (previous.allowCloudAudioUpload && !settings.allowCloudAudioUpload)
    // Revocation must work even when a saved provider was removed or its credentials became invalid.
    if (!revoking && ['cloud', 'auto'].includes(settings.transcriptionMode) && settings.cloudProviderId)
      await this.cloudConfig(settings)
    else if (!revoking && settings.transcriptionMode === 'cloud' && !settings.cloudProviderId)
      throw new InternetError('NEED_SETUP', 'Choose a saved audio transcription provider and a timestamp-capable model.')
    await this.file.edit((state) => {
      Object.assign(state, settings)
    })
    this.current = { ...settings }
    return this.read()
  }

  async choices(): Promise<SavedTranscriptionChoice[]> {
    const snapshot = (await this.providers.read()).config
    return Object.entries(snapshot?.providers ?? {}).filter(([, provider]) => compatibleDefinitions.includes(provider.definitionId)).map(([id, provider]) => ({
      id,
      label: `${provider.definitionId === 'openai-audio-transcription' ? 'OpenAI' : 'OpenAI Compatible'} (${id})`,
      models: provider.definitionId === 'openai-audio-transcription' ? ['whisper-1'] : [],
      customModel: provider.definitionId !== 'openai-audio-transcription',
      ready: ['configured', 'bypassed'].includes(provider.status),
    }))
  }

  async cloudConfig(selection?: StudyAlongSettings): Promise<TranscriptionConfig> {
    const settings = selection ?? await this.selection()
    const selected = (await this.providers.read()).config?.providers[settings.cloudProviderId]
    if (!selected || !compatibleDefinitions.includes(selected.definitionId) || !['configured', 'bypassed'].includes(selected.status))
      throw new InternetError('NEED_SETUP', 'The selected saved audio provider is missing or unconfigured.')
    const model = v.safeParse(modelSchema, settings.cloudModel)
    if (!model.success || (selected.definitionId === 'openai-audio-transcription' && model.output !== 'whisper-1'))
      throw new InternetError('NEED_SETUP', 'Choose a timestamp-capable model. OpenAI requires whisper-1. Compatible endpoints must support verbose_json segments.')
    const { apiKey, baseUrl } = selected.config
    if (typeof apiKey !== 'string' || !apiKey.trim() || typeof baseUrl !== 'string')
      throw new InternetError('NEED_SETUP', 'The saved audio provider requires a key and an HTTPS endpoint.')
    try {
      const endpoint = new URL(baseUrl)
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
        throw new Error('Invalid endpoint')
    }
    catch {
      throw new InternetError('NEED_SETUP', 'The selected audio endpoint requires HTTPS without embedded credentials, query, or fragment.')
    }
    return { apiKey, baseUrl, model: model.output }
  }
}
