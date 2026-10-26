<script setup lang="ts">
import { electron } from '@angela/electron-eventa'
import { useElectronEventaInvoke } from '@angela/electron-vueuse'
import { ChatSessionsDrawer, HearingStatus, ProfileSwitcherPopover } from '@angela/stage-ui/components'
import { useSpeechOutput } from '@angela/stage-ui/composables/use-speech-output'
import { useVoiceListening } from '@angela/stage-ui/composables/voice-input-mode'
import { useAngelaCardStore } from '@angela/stage-ui/stores/modules/angela-card'
import { useOnboardingStore } from '@angela/stage-ui/stores/onboarding'
import { useSettings } from '@angela/stage-ui/stores/settings'
import { useVoiceStore } from '@angela/stage-ui/stores/voice'
import { GhostButton } from '@angela/ui'
import { storeToRefs } from 'pinia'
import { onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import AuthStatusIsland from '../components/stage-islands/auth-status-island.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

import { electronOpenInlay, electronOpenOnboarding, electronOpenSettings, electronWindowSetAlwaysOnTop } from '../../shared/eventa'
import { usePushToTalkShortcut } from '../composables/use-push-to-talk-shortcut'

const { t } = useI18n()
const settings = useSettings()
const { activeCard } = storeToRefs(useAngelaCardStore())
const { alwaysOnTop } = storeToRefs(settings)
const sessionsDrawerOpen = shallowRef(false)
const onboarding = useOnboardingStore()
const voice = useVoiceStore()
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)
const openInlay = useElectronEventaInvoke(electronOpenInlay)
const closeWindow = useElectronEventaInvoke(electron.window.close)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

useSpeechOutput()
useVoiceListening()
usePushToTalkShortcut()

watch(alwaysOnTop, value => void setAlwaysOnTop(value), { immediate: true })
watch(() => voice.state?.phase === 'capturing', (capturing) => {
  if (capturing)
    void openInlay()
})
watch(() => voice.error, (error) => {
  if (error)
    toast.error(error)
})
watch(
  () => voice.drafts.filter(draft => !draft.sending).map(draft => `${draft.id}:${draft.rawText}`).join('\0'),
  (drafts) => {
    if (drafts)
      void openInlay()
  },
)
onMounted(() => {
  if (onboarding.needsOnboarding)
    void openOnboarding()
})
</script>

<template>
  <ChatPageShell>
    <WindowTitleBar
      :title="activeCard?.name || 'Angela'"
      icon="i-solar:chat-line-bold"
      @title-click="sessionsDrawerOpen = true"
    >
      <template #actions>
        <ProfileSwitcherPopover
          active
          content-side="bottom"
          content-align="end"
          @manage="openSettings({ route: '/settings/angela-card' })"
        >
          <template #default="{ toggle }">
            <GhostButton
              size="sm"
              icon="i-solar:user-circle-linear"
              :aria-label="t('tamagotchi.stage.controls-island.switch-profile')"
              :title="t('tamagotchi.stage.controls-island.switch-profile')"
              @click="toggle"
            />
          </template>
        </ProfileSwitcherPopover>
        <ChatSpeechMuteButton />
        <GhostButton
          size="sm"
          :icon="alwaysOnTop ? 'i-solar:pin-bold-duotone' : 'i-solar:pin-linear'"
          :aria-pressed="alwaysOnTop"
          :aria-label="t(alwaysOnTop ? 'tamagotchi.stage.controls-island.unpin-from-top' : 'tamagotchi.stage.controls-island.pin-on-top')"
          @click="alwaysOnTop = !alwaysOnTop"
        />
        <GhostButton
          size="sm"
          icon="i-solar:settings-linear"
          :aria-label="t('tamagotchi.stage.controls-island.open-settings')"
          :title="t('tamagotchi.stage.controls-island.open-settings')"
          @click="openSettings({ route: '/settings' })"
        />
        <GhostButton
          size="sm"
          icon="i-solar:close-circle-linear"
          :aria-label="t('tamagotchi.stage.controls-island.close')"
          :title="t('tamagotchi.stage.controls-island.close')"
          @click="closeWindow()"
        />
      </template>
    </WindowTitleBar>
    <div
      v-if="!settings.streamerMode"
      :class="['absolute left-1/2 top-12 z-30 flex items-center gap-2 -translate-x-1/2']"
    >
      <AuthStatusIsland />
      <HearingStatus align="center" />
    </div>
    <InteractiveArea :class="['h-full w-full']" />
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
