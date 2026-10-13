<script setup lang="ts">
import type { LearningCategory, LearningMemory } from '../../stores/modules/learning-memory'

import { errorMessageFrom } from '@moeru/std'
import { Button, FieldCheckbox, FieldInput, FieldSelect, GhostButton, SettingsCard } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useLearningMemoryStore } from '../../stores/modules/learning-memory'

const { t } = useI18n()
const store = useLearningMemoryStore()
const cards = useAiriCardStore()
const characterId = computed(() => cards.activeCardId)
const entries = computed(() => store.forCharacter(characterId.value))
const categoryOptions = computed(() => (['topic', 'goal', 'difficulty', 'preference'] as const).map(value => ({ value, label: t(`settings.pages.modules.memory-long-term.learning.categories.${value}`) })))
const category = ref<LearningCategory>('topic')
const text = ref('')
const editingId = ref<string>()
const busy = ref(false)
const error = ref('')
const valid = computed(() => !!text.value.trim() && text.value.trim().length <= 500)

function resetEditor() {
  editingId.value = undefined
  category.value = 'topic'
  text.value = ''
  error.value = ''
}

watch(characterId, resetEditor)

function edit(entry: LearningMemory) {
  editingId.value = entry.id
  category.value = entry.category
  text.value = entry.text
  error.value = ''
}

function showError(cause: unknown) {
  const code = errorMessageFrom(cause)
  error.value = t(`settings.pages.modules.memory-long-term.learning.errors.${code === 'missing' || code === 'limit' ? code : 'storage'}`)
}

async function save() {
  if (!valid.value || busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    await store.save(characterId.value, category.value, text.value, editingId.value)
    resetEditor()
  }
  catch (cause) {
    showError(cause)
  }
  finally {
    busy.value = false
  }
}

async function remove(entry: LearningMemory) {
  busy.value = true
  error.value = ''
  try {
    await store.forget(entry.characterId, entry.id)
    if (editingId.value === entry.id)
      resetEditor()
  }
  catch (cause) {
    showError(cause)
  }
  finally {
    busy.value = false
  }
}

async function setEnabled(value: boolean) {
  busy.value = true
  error.value = ''
  try {
    await store.setEnabled(value)
  }
  catch (cause) {
    showError(cause)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <SettingsCard>
    <FieldCheckbox
      :model-value="store.enabled"
      :disabled="busy"
      :label="t('settings.pages.modules.memory-long-term.learning.enable')"
      :description="t('settings.pages.modules.memory-long-term.learning.enable-description')"
      @update:model-value="setEnabled"
    />
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.memory-long-term.learning.description') }}
    </p>
    <h2 :class="['text-lg font-semibold']">
      {{ t('settings.pages.modules.memory-long-term.learning.character', { name: cards.activeCard?.name || characterId }) }}
    </h2>
    <p v-if="!entries.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.memory-long-term.learning.empty') }}
    </p>
    <ul v-else :class="['flex flex-col gap-3']">
      <li
        v-for="entry in entries" :key="entry.id"
        :class="['rounded-xl p-3', 'bg-neutral-100 dark:bg-neutral-900']"
      >
        <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ t(`settings.pages.modules.memory-long-term.learning.categories.${entry.category}`) }}</span>
        <p :class="['whitespace-pre-wrap break-words']">
          {{ entry.text }}
        </p>
        <div :class="['mt-2 flex gap-2']">
          <GhostButton :disabled="busy" @click="edit(entry)">
            {{ t('settings.pages.modules.memory-long-term.learning.edit') }}
          </GhostButton>
          <GhostButton :disabled="busy" @click="remove(entry)">
            {{ t('settings.pages.modules.memory-long-term.learning.delete') }}
          </GhostButton>
        </div>
      </li>
    </ul>
    <form :class="['flex flex-col gap-4']" @submit.prevent="save">
      <h3 :class="['text-base font-medium']">
        {{ t(`settings.pages.modules.memory-long-term.learning.${editingId ? 'editing' : 'add'}`) }}
      </h3>
      <FieldSelect
        v-model="category" :options="categoryOptions" :disabled="busy"
        :label="t('settings.pages.modules.memory-long-term.learning.category')"
      />
      <FieldInput
        v-model="text" :single-line="false" :disabled="busy" input-class="min-h-24"
        :label="t('settings.pages.modules.memory-long-term.learning.content')"
        :placeholder="t('settings.pages.modules.memory-long-term.learning.placeholder')"
      />
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ text.length }}/500
      </p>
      <p v-if="error" role="alert" :class="['text-sm text-red-500']">
        {{ error }}
      </p>
      <div :class="['flex gap-2']">
        <Button type="submit" color="primary" variant="primary" :disabled="!valid || busy" :loading="busy">
          {{ t('settings.pages.modules.memory-long-term.learning.save') }}
        </Button>
        <GhostButton v-if="editingId" :disabled="busy" @click="resetEditor">
          {{ t('settings.pages.modules.memory-long-term.learning.cancel') }}
        </GhostButton>
      </div>
    </form>
  </SettingsCard>
</template>
