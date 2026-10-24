<script setup lang="ts">
import type { StudyAlongSnapshot } from '../../../../../shared/study-along'

import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { Button, FieldInput, FieldTextArea, SettingsCard } from '@angela/ui'
import { errorMessageFrom } from '@moeru/std'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { studyBrowserPair, studyBrowserRevoke } from '../../../../../shared/eventa/browser-media'
import { studyAlongOpenExtension } from '../../../../../shared/eventa/study-along'

const props = defineProps<{ browser: StudyAlongSnapshot['browser'] }>()
const emit = defineEmits<{ refresh: [] }>()
const { t } = useI18n()
const tn = (key: string) => t(`tamagotchi.settings.study-along.${key}`)
const openExtension = useElectronEventaInvoke(studyAlongOpenExtension)
const pair = useElectronEventaInvoke(studyBrowserPair)
const revoke = useElectronEventaInvoke(studyBrowserRevoke)
const extensionId = ref('')
const pairing = ref('')
const busy = ref(false)
const error = ref('')

async function openFiles() {
  error.value = ''
  try {
    await openExtension()
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
}

async function connect() {
  busy.value = true
  error.value = ''
  try {
    pairing.value = JSON.stringify(await pair({ extensionId: extensionId.value }), null, 2)
    emit('refresh')
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
  finally { busy.value = false }
}
async function disconnect() {
  busy.value = true
  error.value = ''
  try {
    await revoke()
    pairing.value = ''
    emit('refresh')
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
  finally { busy.value = false }
}
</script>

<template>
  <SettingsCard>
    <h2 :class="['text-lg font-medium']">
      {{ tn('browser-title') }}
    </h2>
    <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ tn('browser-description') }}
    </p>
    <a href="https://github.com/lighthouse2815/Angela/blob/main/integrations/plugins/web-extension/study-along/README.md" target="_blank" rel="noopener noreferrer" :class="['text-primary-600 underline dark:text-primary-300']">{{ tn('extension-install') }}</a>
    <Button @click="openFiles">
      {{ tn('extension-files') }}
    </Button>
    <p role="status">
      {{ tn(props.browser.connected ? 'browser-connected' : props.browser.paired ? 'browser-waiting' : 'browser-unpaired') }}
    </p>
    <FieldInput v-model="extensionId" :label="tn('extension-id')" :disabled="busy" />
    <div :class="['flex flex-wrap gap-3']">
      <Button :disabled="busy || !/^[a-p]{32}$/.test(extensionId)" @click="connect">
        {{ tn('pair') }}
      </Button>
      <Button :disabled="busy || !props.browser.paired" @click="disconnect">
        {{ tn('revoke') }}
      </Button>
    </div>
    <FieldTextArea v-if="pairing" :model-value="pairing" :label="tn('pairing-data')" :description="tn('pairing-help')" readonly />
    <p v-if="error || props.browser.error" role="alert" :class="['text-sm text-red-600 dark:text-red-300']">
      {{ error || props.browser.error }}
    </p>
  </SettingsCard>
</template>
