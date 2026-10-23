<script setup lang="ts">
import { Button, FieldInput, FieldTextArea } from '@angela/ui'
import { defineInvoke } from '@moeru/eventa'
import { onMounted, ref } from 'vue'

import en from '../../../../../../shared/i18n/src/locales/en/study-along-extension.json'
import vi from '../../../../../../shared/i18n/src/locales/vi/study-along-extension.json'

import { createRuntimeEventaContext } from '../../../src/shared/eventa-runtime'
import { studyExtensionConnect, studyExtensionShare, studyExtensionStatus } from '../../contracts'

const labels = navigator.language.startsWith('vi') ? vi : en
const id = browser.runtime.id
const pairing = ref('')
const message = ref('')
const status = ref({ connected: false, sharing: false, needsPairing: false })
const { context } = createRuntimeEventaContext()
const connect = defineInvoke(context, studyExtensionConnect)
const share = defineInvoke(context, studyExtensionShare)
const readStatus = defineInvoke(context, studyExtensionStatus)

async function act(operation: () => Promise<unknown>) {
  message.value = ''
  try {
    await operation()
    status.value = await readStatus()
    message.value = labels.saved
  }
  catch {
    message.value = labels.error
  }
}
onMounted(async () => {
  status.value = await readStatus()
})
</script>

<template>
  <main :class="['w-88 p-4', 'flex flex-col gap-4']">
    <h1>{{ labels.title }}</h1>
    <p>{{ labels.description }}</p>
    <FieldInput :model-value="id" :label="labels.extensionId" readonly />
    <FieldTextArea v-model="pairing" :label="labels.pairing" />
    <Button :label="labels.connect" @click="act(() => connect({ pairing }))" />
    <Button :label="status.sharing ? labels.stop : labels.share" @click="act(() => share({ enabled: !status.sharing }))" />
    <p aria-live="polite">
      {{ status.connected ? labels.connected : labels.disconnected }} {{ status.needsPairing ? labels.error : message }}
    </p>
  </main>
</template>
