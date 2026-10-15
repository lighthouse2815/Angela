<script setup lang="ts">
import type { LearningCategory, LearningMemory, ReviewInterval } from '../../stores/modules/learning-memory'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { Button, FieldCheckbox, FieldInput, FieldSelect, GhostButton, SettingsCard } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useLearningMemoryStore } from '../../stores/modules/learning-memory'

const { t, locale } = useI18n()
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const store = useLearningMemoryStore()
const cards = useAiriCardStore()
const characterId = computed(() => cards.activeCardId)
const entries = computed(() => store.forCharacter(characterId.value))
const now = useNow({ interval: 60000 })
const scheduled = computed(() => entries.value.filter(entry => entry.review))
const dueCount = computed(() => scheduled.value.filter(entry => entry.review!.nextReviewAt <= now.value.getTime()).length)
const reviewedCount = computed(() => scheduled.value.filter(entry => entry.review!.count > 0).length)
const reviewOptions = computed(() => ([0, 1, 3, 7, 14, 30] as const).map(value => ({ value, label: t(`settings.pages.modules.memory-long-term.learning.review.intervals.${value}`) })))
const categoryOptions = computed(() => (['topic', 'goal', 'difficulty', 'preference'] as const).map(value => ({ value, label: t(`settings.pages.modules.memory-long-term.learning.categories.${value}`) })))
const category = ref<LearningCategory>('topic')
const text = ref('')
const editingId = ref<string>()
const busy = ref(false)
const error = ref('')
const valid = computed(() => !!text.value.trim() && text.value.trim().length <= 500)

watch(entries, () => {
  now.value = new Date()
})

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
  error.value = t(`settings.pages.modules.memory-long-term.learning.errors.${code === 'missing' || code === 'limit' || code === 'unscheduled' ? code : 'storage'}`)
}

async function scheduleReview(entry: LearningMemory, interval: ReviewInterval | undefined) {
  if (busy.value || interval === undefined)
    return
  busy.value = true
  error.value = ''
  try {
    await store.scheduleReview(entry.characterId, entry.id, interval)
  }
  catch (cause) {
    showError(cause)
  }
  finally {
    busy.value = false
  }
}

async function markReviewed(entry: LearningMemory) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    await store.markReviewed(entry.characterId, entry.id)
  }
  catch (cause) {
    showError(cause)
  }
  finally {
    busy.value = false
  }
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

async function setRemindersEnabled(value: boolean) {
  busy.value = true
  error.value = ''
  try {
    await store.setReviewRemindersEnabled(value)
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
    <FieldCheckbox
      v-if="isStageTamagotchi()"
      :model-value="store.reviewRemindersEnabled"
      :disabled="busy || !store.enabled"
      :label="t('settings.pages.modules.memory-long-term.learning.review.notifications.enable')"
      :description="t('settings.pages.modules.memory-long-term.learning.review.notifications.description')"
      @update:model-value="setRemindersEnabled"
    />
    <h2 :class="['text-lg font-semibold']">
      {{ t('settings.pages.modules.memory-long-term.learning.character', { name: cards.activeCard?.name || characterId }) }}
    </h2>
    <p v-if="scheduled.length" role="status" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.memory-long-term.learning.review.summary', { reviewed: reviewedCount, total: scheduled.length, due: dueCount }) }}
    </p>
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
        <FieldSelect
          :model-value="entry.review?.intervalDays ?? 0" :options="reviewOptions" :disabled="busy"
          :label="t('settings.pages.modules.memory-long-term.learning.review.schedule')"
          :class="['mt-3']"
          @update:model-value="scheduleReview(entry, $event)"
        />
        <div v-if="entry.review" :class="['mt-2 text-sm text-neutral-500 dark:text-neutral-400']">
          <p>
            {{ t('settings.pages.modules.memory-long-term.learning.review.count', { count: entry.review.count }, entry.review.count) }}
          </p>
          <p v-if="entry.review.nextReviewAt <= now.getTime()">
            {{ t('settings.pages.modules.memory-long-term.learning.review.due') }}
          </p>
          <p v-else>
            {{ t('settings.pages.modules.memory-long-term.learning.review.next', { date: dateFormat.format(entry.review.nextReviewAt) }) }}
          </p>
        </div>
        <div :class="['mt-2 flex flex-wrap gap-2']">
          <GhostButton v-if="entry.review" :disabled="busy" @click="markReviewed(entry)">
            {{ t('settings.pages.modules.memory-long-term.learning.review.complete') }}
          </GhostButton>
          <GhostButton :disabled="busy" @click="edit(entry)">
            {{ t('settings.pages.modules.memory-long-term.learning.edit') }}
          </GhostButton>
          <GhostButton :disabled="busy" @click="remove(entry)">
            {{ t('settings.pages.modules.memory-long-term.learning.delete') }}
          </GhostButton>
        </div>
      </li>
    </ul>
    <p v-if="error" role="alert" :class="['text-sm text-red-500']">
      {{ error }}
    </p>
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
