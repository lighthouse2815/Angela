<script setup lang="ts">
import type { LocalModelStatus } from '../../../../../shared/study-along'

import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { Button, FieldInput, SettingsCard } from '@angela/ui'
import { errorMessageFrom } from '@moeru/std'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { studyAlongCancelModel, studyAlongImportModel } from '../../../../../shared/eventa/study-along'

const props = defineProps<{ model: LocalModelStatus }>()
const emit = defineEmits<{ refresh: [] }>()
const { t } = useI18n()
const tn = (key: string) => t(`tamagotchi.settings.study-along.${key}`)
const importModel = useElectronEventaInvoke(studyAlongImportModel)
const cancelModel = useElectronEventaInvoke(studyAlongCancelModel)
const checksum = ref('')
const busy = ref(false)
const error = ref('')

async function install() {
  busy.value = true
  error.value = ''
  try {
    await importModel({ sha256: checksum.value.trim() })
    emit('refresh')
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
  finally { busy.value = false }
}
async function cancel() {
  busy.value = true
  try {
    await cancelModel()
    emit('refresh')
  }
  catch (cause) { error.value = errorMessageFrom(cause) ?? tn('action-error') }
  finally { busy.value = false }
}
</script>

<template>
  <SettingsCard>
    <h2 :class="['text-lg font-medium']">
      {{ tn('local-title') }}
    </h2>
    <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ tn('local-description') }}
    </p>
    <a href="https://huggingface.co/ggerganov/whisper.cpp/tree/main" target="_blank" rel="noopener noreferrer" :class="['text-primary-600 underline dark:text-primary-300']">{{ tn('model-source') }}</a>
    <p role="status">
      {{ tn(`model-${props.model.state.toLowerCase()}`) }}
    </p>
    <progress v-if="props.model.state === 'IMPORTING'" :value="props.model.progress" max="1" :aria-label="tn('model-progress')" :class="['w-full']" />
    <FieldInput v-model="checksum" :label="tn('checksum')" :description="tn('checksum-help')" :disabled="busy || props.model.state === 'IMPORTING'" />
    <div :class="['flex flex-wrap gap-3']">
      <Button :disabled="busy || props.model.state === 'IMPORTING' || !/^[a-f0-9]{64}$/i.test(checksum.trim())" @click="install">
        {{ tn('model-import') }}
      </Button>
      <Button v-if="props.model.state === 'IMPORTING'" :disabled="busy" @click="cancel">
        {{ tn('cancel') }}
      </Button>
    </div>
    <p v-if="error || props.model.error" role="alert" :class="['text-sm text-red-600 dark:text-red-300']">
      {{ error || props.model.error }}
    </p>
  </SettingsCard>
</template>
