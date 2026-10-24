import * as v from 'valibot'

/** Contains choices only. Saved provider credentials and local filesystem paths stay in the main process. */
export const studyAlongSettingsSchema = v.strictObject({
  enabled: v.boolean(),
  transcriptionMode: v.picklist(['disabled', 'local', 'cloud', 'auto']),
  cloudProviderId: v.pipe(v.string(), v.maxLength(200)),
  cloudModel: v.pipe(v.string(), v.maxLength(128)),
  allowCloudAudioUpload: v.boolean(),
  cacheTtlDays: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(90)),
})
export type StudyAlongSettings = v.InferOutput<typeof studyAlongSettingsSchema>
export const defaultStudyAlongSettings: StudyAlongSettings = {
  enabled: true,
  transcriptionMode: 'disabled',
  cloudProviderId: '',
  cloudModel: '',
  allowCloudAudioUpload: false,
  cacheTtlDays: 30,
}

export interface SavedTranscriptionChoice {
  id: string
  label: string
  models: string[]
  customModel: boolean
  ready: boolean
}
export interface LocalModelStatus {
  state: 'MISSING' | 'IMPORTING' | 'READY' | 'ERROR'
  progress: number
  sha256: string | null
  error: string | null
}
export interface StudyAlongSnapshot {
  settings: StudyAlongSettings
  providers: SavedTranscriptionChoice[]
  model: LocalModelStatus
  browser: { connected: boolean, paired: boolean, error: string | null }
  overrides?: { cloudProviderId: string, cloudModel: string }
}
