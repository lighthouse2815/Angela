<script setup lang="ts">
import type { TaskCommand } from '@angela/companion/task-contracts'
import type { Task, TaskInput, TaskPatch } from '@angela/companion/task-schema'

import { localInstant } from '@angela/companion/task-time'
import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { useAngelaCardStore } from '@angela/stage-ui/stores/modules/angela-card'
import { Button, FieldInput, FieldSelect, GhostButton, SettingsCard } from '@angela/ui'
import { errorMessageFrom } from '@moeru/std'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { isEqual } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { companionTasks } from '../../../../shared/eventa/companion-runtime'

const { t, locale } = useI18n()
const { activeCardId } = storeToRefs(useAngelaCardStore())
const invoke = useElectronEventaInvoke(companionTasks)
const tasks = ref<Task[]>([])
const status = ref<Task['status'] | 'all'>('pending')
const title = ref('')
const taskType = ref<Task['type']>('todo')
const date = ref('')
const time = ref('')
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone)
const repeat = ref<'none' | 'daily' | 'weekly'>('none')
const interval = ref<number | undefined>(1)
const days = ref<number[]>([])
const context = ref('')
const editing = ref<string>()
const original = ref<Task>()
let originalDate = ''
let originalTime = ''
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const saved = ref(false)
const snoozeMinutes = ref<number | undefined>(15)
const visibility = useDocumentVisibility()
// Profile changes invalidate reads and mutation responses. A mutation keeps its original character and never changes another profile's form.
let generation = 0
let readSequence = 0
let disposed = false
let initializedTimezone = false
const shown = computed(() => tasks.value.filter(task => status.value === 'all' || task.status === status.value))
const types = computed(() => (['todo', 'reminder', 'deadline', 'routine', 'follow_up'] as const).map(value => ({ value, label: t(`settings.pages.tasks.types.${value}`) })))
const statuses = computed(() => (['pending', 'completed', 'cancelled', 'all'] as const).map(value => ({ value, label: t(`settings.pages.tasks.statuses.${value}`) })))
const repeats = computed(() => (['none', 'daily', 'weekly'] as const).map(value => ({ value, label: t(`settings.pages.tasks.repeats.${value}`) })))
const weekdays = computed(() => Array.from({ length: 7 }, (_, value) => ({ value, label: new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + value))) })))

function resetForm() {
  editing.value = undefined
  original.value = undefined
  originalDate = ''
  originalTime = ''
  title.value = ''
  taskType.value = 'todo'
  date.value = ''
  time.value = ''
  repeat.value = 'none'
  interval.value = 1
  days.value = []
  context.value = ''
}

async function refresh() {
  const characterId = activeCardId.value
  if (!characterId || busy.value || disposed)
    return
  const sequence = ++readSequence
  const owner = generation
  loading.value = true
  try {
    const response = await invoke({ characterId, command: { type: 'list' } })
    if (disposed || owner !== generation || sequence !== readSequence)
      return
    tasks.value = response.tasks
    if (!initializedTimezone) {
      timezone.value = response.timezone
      initializedTimezone = true
    }
  }
  catch (cause) {
    if (!disposed && owner === generation && sequence === readSequence)
      error.value = errorMessageFrom(cause) ?? t('settings.pages.tasks.failed')
  }
  finally {
    if (owner === generation && sequence === readSequence)
      loading.value = false
  }
}

async function mutate(command: TaskCommand) {
  if (busy.value)
    return false
  const owner = generation
  const characterId = activeCardId.value
  ++readSequence
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    const response = await invoke({ characterId, command })
    if (disposed || owner !== generation)
      return false
    tasks.value = response.tasks
    saved.value = true
    return true
  }
  catch (cause) {
    if (!disposed && owner === generation)
      error.value = errorMessageFrom(cause) ?? t('settings.pages.tasks.failed')
    return false
  }
  finally {
    if (owner === generation) {
      busy.value = false
      loading.value = false
    }
  }
}

async function save() {
  if (busy.value)
    return
  error.value = ''
  try {
    if ((repeat.value !== 'none' || taskType.value === 'routine') && (!date.value || !time.value || repeat.value === 'none'))
      throw new Error(t('settings.pages.tasks.repeatRequired'))
    let dueAt: string | undefined
    if (date.value && time.value) {
      // The minute-level form preserves an unchanged timestamp's original seconds and milliseconds.
      dueAt = original.value && date.value === originalDate && time.value === originalTime && timezone.value === original.value.timezone
        ? original.value.dueAt
        : new Date(localInstant(Date.parse(`${date.value}T${time.value}:00Z`), timezone.value)).toISOString()
    }
    const input: TaskInput = {
      title: title.value,
      type: taskType.value,
      timezone: timezone.value,
      ...(dueAt ? { dueAt } : date.value ? { dueDate: date.value } : {}),
      ...(repeat.value !== 'none' ? { recurrence: { type: repeat.value, interval: interval.value, ...(repeat.value === 'weekly' && days.value.length ? { daysOfWeek: [...days.value].sort() } : {}) } } : {}),
      ...(context.value ? { context: context.value } : {}),
    }
    const changes: TaskPatch = { title: input.title, type: input.type, context: input.context ?? null }
    // Title and note edits must preserve snooze and delivery receipts. Only changed scheduling fields reset the schedule.
    if (input.dueAt !== original.value?.dueAt)
      changes.dueAt = input.dueAt ?? null
    if (input.dueDate !== original.value?.dueDate)
      changes.dueDate = input.dueDate ?? null
    if (input.timezone !== original.value?.timezone)
      changes.timezone = input.timezone
    if (!isEqual(input.recurrence, original.value?.recurrence))
      changes.recurrence = input.recurrence ?? null
    const command: TaskCommand = editing.value
      ? { type: 'update', id: editing.value, changes }
      : { type: 'create', input }
    if (await mutate(command))
      resetForm()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.pages.tasks.failed')
  }
}

function edit(task: Task) {
  resetForm()
  editing.value = task.id
  original.value = task
  title.value = task.title
  taskType.value = task.type
  timezone.value = task.timezone
  context.value = task.context ?? ''
  repeat.value = task.recurrence?.type ?? 'none'
  interval.value = task.recurrence?.interval ?? 1
  days.value = [...(task.recurrence?.daysOfWeek ?? [])]
  if (task.dueAt) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: task.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(task.dueAt))
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
    date.value = `${part('year')}-${part('month')}-${part('day')}`
    time.value = `${part('hour')}:${part('minute')}`
  }
  else {
    date.value = task.dueDate ?? ''
  }
  originalDate = date.value
  originalTime = time.value
  document.querySelector<HTMLInputElement>('[data-testid="task-form"] input')?.focus()
}

function formatDue(task: Task) {
  const instant = task.snoozedUntil ?? task.dueAt
  if (instant)
    return `${new Intl.DateTimeFormat(locale.value, { timeZone: task.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant))} · ${task.timezone}`
  if (task.dueDate)
    return new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${task.dueDate}T00:00:00Z`))
  return t('settings.pages.tasks.noDue')
}

watch(activeCardId, () => {
  ++generation
  busy.value = false
  loading.value = false
  tasks.value = []
  initializedTimezone = false
  resetForm()
  error.value = ''
  saved.value = false
  void refresh()
}, { immediate: true })
const poll = useIntervalFn(() => {
  if (visibility.value === 'visible')
    void refresh()
}, 10000)
onScopeDispose(() => {
  disposed = true
  ++generation
  poll.pause()
})
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.tasks.delivery') }}
    </p>
    <div v-if="error" role="alert" :class="['rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200']">
      {{ error }}
    </div>
    <p v-if="saved" role="status" :class="['text-sm text-primary-600 dark:text-primary-300']">
      {{ t('settings.pages.tasks.saved') }}
    </p>
    <SettingsCard>
      <form data-testid="task-form" :class="['flex flex-col gap-4']" @submit.prevent="save">
        <h2 :class="['text-base font-semibold']">
          {{ t(editing ? 'settings.pages.tasks.editTitle' : 'settings.pages.tasks.createTitle') }}
        </h2>
        <fieldset :disabled="busy" :class="['min-w-0 flex flex-col gap-4']">
          <FieldInput v-model="title" :label="t('settings.pages.tasks.titleLabel')" required />
          <FieldSelect v-model="taskType" :label="t('settings.pages.tasks.typeLabel')" :options="types" />
          <div :class="['grid gap-4 sm:grid-cols-2']">
            <FieldInput v-model="date" type="date" :label="t('settings.pages.tasks.date')" />
            <FieldInput v-model="time" type="time" :label="t('settings.pages.tasks.time')" :disabled="!date" />
          </div>
          <FieldInput v-model="timezone" :label="t('settings.pages.tasks.timezone')" required />
          <FieldSelect v-model="repeat" :label="t('settings.pages.tasks.repeat')" :options="repeats" />
          <FieldInput v-if="repeat !== 'none'" v-model="interval" type="number" :label="t('settings.pages.tasks.interval')" required />
          <div v-if="repeat === 'weekly'" :class="['flex flex-wrap gap-2']">
            <GhostButton v-for="day in weekdays" :key="day.value" type="button" :aria-pressed="days.includes(day.value)" :class="[days.includes(day.value) ? 'bg-primary-100 dark:bg-primary-900' : '']" @click="days = days.includes(day.value) ? days.filter(value => value !== day.value) : [...days, day.value]">
              {{ day.label }}
            </GhostButton>
          </div>
          <FieldInput v-model="context" :label="t('settings.pages.tasks.notes')" />
          <div :class="['flex flex-wrap gap-2']">
            <Button type="submit" color="primary" variant="primary" :loading="busy" :label="t(editing ? 'settings.pages.tasks.save' : 'settings.pages.tasks.create')" />
            <Button v-if="editing" type="button" :label="t('settings.pages.tasks.discard')" @click="resetForm" />
          </div>
        </fieldset>
      </form>
    </SettingsCard>
    <SettingsCard>
      <div :class="['flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between']">
        <FieldSelect v-model="status" :label="t('settings.pages.tasks.filter')" :options="statuses" />
        <Button :label="t('settings.pages.tasks.refresh')" :loading="loading" :disabled="busy" @click="error = ''; refresh()" />
      </div>
      <FieldInput v-model="snoozeMinutes" type="number" :label="t('settings.pages.tasks.snoozeMinutes')" />
      <p v-if="!shown.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.tasks.empty') }}
      </p>
      <article v-for="task in shown" :key="task.id" :data-testid="`task-${task.id}`" :class="['flex flex-col gap-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900']">
        <div>
          <h3 :class="['break-words font-medium']">
            {{ task.title }}
          </h3>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ formatDue(task) }} · {{ t(`settings.pages.tasks.types.${task.type}`) }} · {{ t(`settings.pages.tasks.statuses.${task.status}`) }}
          </p>
          <p v-if="task.recurrence" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t(`settings.pages.tasks.repeats.${task.recurrence.type}`) }} · {{ task.recurrence.interval }}
          </p>
          <p v-if="task.context" :class="['break-words text-sm']">
            {{ task.context }}
          </p>
        </div>
        <div v-if="task.status === 'pending'" :class="['flex flex-wrap gap-2']">
          <Button size="sm" :disabled="busy" :label="t('settings.pages.tasks.edit')" @click="edit(task)" />
          <Button size="sm" :disabled="busy" :label="t('settings.pages.tasks.complete')" @click="mutate({ type: 'complete', id: task.id })" />
          <Button size="sm" :disabled="busy || !snoozeMinutes || snoozeMinutes < 1 || snoozeMinutes > 527040" :label="t('settings.pages.tasks.snooze')" @click="mutate({ type: 'snooze', id: task.id, until: new Date(Date.now() + (snoozeMinutes ?? 15) * 60000).toISOString() })" />
          <Button size="sm" color="red" :disabled="busy" :label="t('settings.pages.tasks.cancel')" @click="mutate({ type: 'cancel', id: task.id })" />
        </div>
      </article>
    </SettingsCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.tasks.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.tasks.description
  icon: i-solar:checklist-minimalistic-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
</route>
