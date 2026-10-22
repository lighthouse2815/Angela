<script setup lang="ts">
import AccountSettingsPage from '@angela/stage-pages/pages/settings/account/account-settings-page.vue'

import { signOut } from '@angela/stage-ui/libs/auth'
import { useAuthStore } from '@angela/stage-ui/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

async function handleLogin() {
  await authStore.requestLogin()
}

async function handleLogout() {
  await signOut()
  router.push('/settings')
}
</script>

<template>
  <AccountSettingsPage @login="handleLogin" @logout="handleLogout" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.account.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.account.description
  icon: i-solar:user-circle-bold-duotone
  settingsEntry: false
  order: 0
  stageTransition:
    name: slide
</route>
