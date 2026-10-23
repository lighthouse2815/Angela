import messages from '@angela/i18n/locales'
import workerURL from '@sherpaw/xsai-transcription/worker?worker&url'

import { resolveSupportedLocale } from '@angela/i18n'
import { createSherpawTranscriptionDefinition } from '@angela/provider-inference'
import { isStageCapacitor } from '@angela/stage-shared'

import { defineProvider } from '../registry'
import { fetchSherpawModel } from './model-assets'
import { sherpawModelResources } from './model-resources'

export { executeSherpawStream, SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '@angela/provider-inference'

function getInterfaceLanguage(): string {
  const language = globalThis.localStorage?.getItem('settings/language') || globalThis.navigator?.language || 'en'
  return resolveSupportedLocale(language, Object.keys(messages))
}

function isMobile(): boolean {
  return isStageCapacitor() || (globalThis.matchMedia?.('(max-width: 767px)').matches ?? false)
}

export const providerSherpawTranscription = defineProvider({
  ...createSherpawTranscriptionDefinition({
    models: sherpawModelResources,
    workerURL,
    fetchModel: fetchSherpawModel,
    getInterfaceLanguage,
    isMobile,
  }),
  views: {
    hearing: () => import('./hearing-settings.vue'),
  },
})
