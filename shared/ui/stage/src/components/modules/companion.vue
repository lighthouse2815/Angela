<script setup lang="ts">
import type { CompanionEntry } from '../../stores/modules/companion'

import { Button, FieldCheckbox, FieldInput, FieldSelect, SettingsCard } from '@angela/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAngelaCardStore } from '../../stores/modules/angela-card'
import { useCompanionStore } from '../../stores/modules/companion'
import { useLearningMemoryStore } from '../../stores/modules/learning-memory'

const { t } = useI18n()
const store = useCompanionStore()
const memory = useLearningMemoryStore()
const cards = useAngelaCardStore()
const text = ref('')
const kind = ref<CompanionEntry['kind']>('activity')
const minutes = ref(25)
const busy = ref(false)
const error = ref('')
const entries = computed(() => store.forCharacter(cards.activeCardId))
const kinds = computed(() => (['preference', 'thread', 'activity'] as const).map(value => ({ value, label: t(`base.companion.kinds.${value}`) })))
const intervals = computed(() => [0, 25, 50, 1440].map(value => ({ value, label: value === 0 ? t('base.companion.no-timer') : t('base.companion.minutes', { count: value }) })))

async function edit(action: () => Promise<unknown>) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    await action()
  }
  catch { error.value = t('base.companion.error') }
  finally { busy.value = false }
}

async function save() {
  await edit(async () => {
    await store.save(cards.activeCardId, kind.value, text.value, kind.value !== 'preference' && minutes.value > 0 ? Date.now() + minutes.value * 60000 : null)
    text.value = ''
  })
}
</script>

<template>
  <SettingsCard :title="t('base.companion.title')" :description="t('base.companion.description')">
    <div :class="['flex flex-col gap-4']">
      <FieldCheckbox :model-value="store.state.enabled" :label="t('base.companion.enabled')" :disabled="busy" @update:model-value="value => edit(() => store.setEnabled(value))" />
      <p v-if="!memory.enabled" :class="['text-sm text-neutral-500']">
        {{ t('base.companion.memory-disabled') }}
      </p>
      <template v-if="store.state.enabled && memory.enabled">
        <FieldSelect v-model="kind" :options="kinds" :label="t('base.companion.kind')" />
        <FieldInput v-model="text" :label="t('base.companion.subject')" />
        <FieldSelect v-if="kind !== 'preference'" v-model="minutes" :options="intervals" :label="t('base.companion.follow-up')" />
        <Button :disabled="busy || !text.trim() || text.length > 500" @click="save">
          {{ t('base.companion.save') }}
        </Button>
      </template>
      <p v-if="error" role="alert">
        {{ error }}
      </p>
      <div v-for="entry in entries" :key="entry.id" :class="['flex flex-col gap-2', 'border border-neutral-200 rounded-lg p-3 dark:border-neutral-700']">
        <p :class="['whitespace-pre-wrap break-words']">
          {{ entry.text }}
        </p>
        <p :class="['text-xs text-neutral-500']">
          {{ t(`base.companion.kinds.${entry.kind}`) }} · {{ t(`base.companion.status.${entry.status}`) }}
          <time v-if="entry.dueAt" :datetime="new Date(entry.dueAt).toISOString()"> · {{ new Date(entry.dueAt).toLocaleString() }}</time>
        </p>
        <div :class="['flex flex-wrap gap-2']">
          <Button v-if="entry.status === 'open' && entry.kind !== 'preference'" :disabled="busy" @click="edit(() => store.resolve(entry.characterId, entry.id, 'completed'))">
            {{ t('base.companion.complete') }}
          </Button>
          <Button v-if="entry.status === 'open'" :disabled="busy" @click="edit(() => store.resolve(entry.characterId, entry.id, 'dismissed'))">
            {{ t('base.companion.dismiss') }}
          </Button>
          <Button :disabled="busy" @click="edit(() => store.forget(entry.characterId, entry.id))">
            {{ t('base.companion.forget') }}
          </Button>
        </div>
      </div>
    </div>
  </SettingsCard>
</template>
