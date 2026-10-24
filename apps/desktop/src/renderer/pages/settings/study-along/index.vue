<script setup lang="ts">
import type { InternetDiagnostic } from '../../../../shared/eventa/internet'
import type { StudyAlongSnapshot } from '../../../../shared/study-along'

import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { Button, FieldCheckbox, FieldInput, FieldSelect, SettingsCard } from '@angela/ui'
import { errorMessageFrom } from '@moeru/std'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BrowserPairing from './components/browser-pairing.vue'
import LocalModel from './components/local-model.vue'

import { internetDiagnostics } from '../../../../shared/eventa/internet'
import { studyAlongGetSettings, studyAlongSaveSettings } from '../../../../shared/eventa/study-along'
import { defaultStudyAlongSettings } from '../../../../shared/study-along'

const { t } = useI18n()
const tn = (key: string, params: Record<string, string> = {}) => t(`tamagotchi.settings.study-along.${key}`, params)
const getSettings = useElectronEventaInvoke(studyAlongGetSettings)
const saveSettings = useElectronEventaInvoke(studyAlongSaveSettings)
const diagnose = useElectronEventaInvoke(internetDiagnostics)
const settings = ref({ ...defaultStudyAlongSettings })
const snapshot = ref<StudyAlongSnapshot>()
const diagnostics = ref<InternetDiagnostic[]>([])
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const saved = ref(false)
const modeOptions = computed(() => ['disabled', 'local', 'cloud', 'auto'].map(value => ({ value, label: tn(`mode-${value}`) })))
const providerOptions = computed(() => snapshot.value?.providers.map(provider => ({ value: provider.id, label: provider.label })) ?? [])
const selectedProvider = computed(() => snapshot.value?.providers.find(provider => provider.id === settings.value.cloudProviderId))
const modelOptions = computed(() => selectedProvider.value?.models.map(value => ({ value, label: value })) ?? [])

async function refresh() {
  try {
    snapshot.value = await getSettings()
    if (!loaded.value) {
      settings.value = { ...snapshot.value.settings }
      loaded.value = true
    }
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
}
async function save() {
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    snapshot.value = await saveSettings({ ...settings.value })
    settings.value = { ...snapshot.value.settings }
    saved.value = true
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
  finally { busy.value = false }
}
async function check() {
  busy.value = true
  error.value = ''
  try {
    diagnostics.value = await diagnose()
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
  finally { busy.value = false }
}
onMounted(refresh)
useIntervalFn(() => {
  if (snapshot.value?.model.state === 'IMPORTING' || snapshot.value?.browser.paired)
    void refresh()
}, 2000)
</script>

<template>
  <div :class="['flex flex-col gap-6 pb-12']">
    <SettingsCard>
      <h2 :class="['text-lg font-medium']">
        {{ tn('title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ tn('description') }}
      </p>
      <FieldCheckbox v-model="settings.enabled" :label="tn('enabled')" :disabled="busy || !loaded" />
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ tn('subtitle-order') }}
      </p>
      <FieldSelect v-model="settings.transcriptionMode" :label="tn('audio-source')" :options="modeOptions" :disabled="busy || !loaded" />
      <template v-if="['cloud', 'auto'].includes(settings.transcriptionMode)">
        <p v-if="snapshot?.overrides" role="status" :class="['text-sm text-amber-700 dark:text-amber-300']">
          {{ tn('advanced-overrides', snapshot.overrides) }}
        </p>
        <FieldSelect v-model="settings.cloudProviderId" :label="tn('cloud-provider')" :options="providerOptions" :disabled="busy" />
        <RouterLink to="/settings/providers" :class="['text-primary-600 underline dark:text-primary-300']">
          {{ tn('manage-providers') }}
        </RouterLink>
        <FieldSelect v-if="modelOptions.length" v-model="settings.cloudModel" :label="tn('model')" :options="modelOptions" :disabled="busy" />
        <FieldInput v-else v-model="settings.cloudModel" :label="tn('model')" :description="tn('model-help')" :disabled="busy" />
        <FieldCheckbox v-model="settings.allowCloudAudioUpload" :label="tn('allow-upload')" :description="tn('upload-help')" :disabled="busy" />
      </template>
      <FieldInput v-model="settings.cacheTtlDays" type="number" :label="tn('cache-days')" :description="tn('cache-help')" :disabled="busy || !loaded" />
      <Button :disabled="busy || !loaded" @click="save">
        {{ tn('save') }}
      </Button>
      <p v-if="saved" role="status">
        {{ tn('saved') }}
      </p>
      <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-300']">
        {{ error }}
      </p>
    </SettingsCard>
    <LocalModel v-if="snapshot" :model="snapshot.model" @refresh="refresh" />
    <BrowserPairing v-if="snapshot" :browser="snapshot.browser" @refresh="refresh" />
    <SettingsCard>
      <h2 :class="['text-lg font-medium']">
        {{ tn('diagnostics-title') }}
      </h2>
      <Button :disabled="busy" @click="check">
        {{ tn('check') }}
      </Button>
      <ul :class="['flex flex-col gap-3']">
        <li v-for="row in diagnostics" :key="row.capability">
          <strong>{{ row.capability }}</strong>: {{ row.status }} <span v-if="row.toolSource">({{ row.toolSource }})</span>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ row.detail }}
          </p>
        </li>
      </ul>
    </SettingsCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.study-along.title
  descriptionKey: tamagotchi.settings.study-along.description
  icon: i-solar:clapperboard-play-bold-duotone
  settingsEntry: true
  order: 3
  stageTransition:
    name: slide
</route>
