<script setup lang="ts">
import type { ChatSessionsExport } from '@angela/stage-ui/types/chat-session'

import ChatsSection from '@angela/stage-pages/pages/settings/data/components/chats-section.vue'
import DangerSection from '@angela/stage-pages/pages/settings/data/components/danger-section.vue'
import DownloadedModelsSection from '@angela/stage-pages/pages/settings/data/components/downloaded-models-section.vue'
import ModelsModulesSection from '@angela/stage-pages/pages/settings/data/components/models-modules-section.vue'
import StatusBanner from '@angela/stage-pages/pages/settings/data/components/status-banner.vue'

import { createDataSettingsStatusState } from '@angela/stage-pages/pages/settings/data/status'
import { useChatSessionStore } from '@angela/stage-ui/stores/chat/session-store'

import DesktopFolderSection from './components/desktop-folder-section.vue'
import DesktopResetSection from './components/desktop-reset-section.vue'

const { statusMessage, statusTone, handleStatus } = createDataSettingsStatusState()
const chatSession = useChatSessionStore()

async function syncImportedChats(payload: ChatSessionsExport) {
  await chatSession.importSessions(payload)
}
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-4']">
    <StatusBanner v-if="statusMessage" :message="statusMessage" :tone="statusTone" />
    <DesktopFolderSection @status="handleStatus" />
    <ChatsSection :sync-imported-chats="syncImportedChats" @status="handleStatus" />
    <DownloadedModelsSection @status="handleStatus" />
    <ModelsModulesSection @status="handleStatus" />
    <DesktopResetSection @status="handleStatus" />
    <DangerSection @status="handleStatus" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.data.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.data.description
  icon: i-solar:database-bold-duotone
  settingsEntry: true
  order: 7
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
