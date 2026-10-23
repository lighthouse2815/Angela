<script setup lang="ts">
import CardEditor from './components/CardEditor.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'

import { useAngelaCardEditorPage } from './composables/use-angela-card-editor-page'

const {
  isDirty,
  showUnsavedChangesDialog,
  initialSection,
  handleBack,
  handleSectionChange,
  handleDiscardChanges,
  handleCancelDiscard,
  handleSaved,
} = useAngelaCardEditorPage()
</script>

<template>
  <CardEditor
    v-model:dirty="isDirty"
    :initial-section="initialSection"
    @back="handleBack"
    @saved="handleSaved"
    @update:section="handleSectionChange"
  />

  <UnsavedChangesDialog
    v-model="showUnsavedChangesDialog"
    @discard="handleDiscardChanges"
    @cancel="handleCancelDiscard"
  />
</template>

<route lang="yaml">
alias: /settings/airi-card/new
meta:
  layout: plain
  titleKey: settings.pages.card.create_card
  transition: card-expand
  transitionBack: card-collapse
</route>
