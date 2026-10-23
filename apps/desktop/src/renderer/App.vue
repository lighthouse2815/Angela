<script setup lang="ts">
import type { ArtistrySyncPayload } from '@angela/stage-shared'

import { useElectronEventaContext, useElectronEventaInvoke } from '@angela/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@angela/stage-layouts/composables/theme-color'
import { artistrySyncConfig } from '@angela/stage-shared'
import { ToasterRoot } from '@angela/stage-ui/components'
import { updateModelAssetStatus, useInferencePreload } from '@angela/stage-ui/composables'
import { usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { initializeAnalytics } from '@angela/stage-ui/libs/product-signals'
import { isSherpawModelBundled, setSherpawModelAssetHost } from '@angela/stage-ui/libs/providers/providers/sherpaw/model-assets'
import { connectLocalProviderConfig } from '@angela/stage-ui/services/local-provider-config'
import { useAuthStore } from '@angela/stage-ui/stores/auth'
import { useCharacterOrchestratorStore } from '@angela/stage-ui/stores/character'
import { useChatStore } from '@angela/stage-ui/stores/chat'
import { usePluginHostInspectorStore } from '@angela/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@angela/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@angela/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@angela/stage-ui/stores/mods/api/context-bridge'
import { useAngelaCardStore } from '@angela/stage-ui/stores/modules/angela-card'
import { useArtistryStore } from '@angela/stage-ui/stores/modules/artistry'
import { useConsciousnessStore } from '@angela/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@angela/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@angela/stage-ui/stores/modules/speech'
import { useVisionStore } from '@angela/stage-ui/stores/modules/vision'
import { useOnboardingStore } from '@angela/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@angela/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@angela/stage-ui/stores/plugin-host-capabilities'
import { useSettings, useSettingsAudioDevice } from '@angela/stage-ui/stores/settings'
import { useSettingsStageModel } from '@angela/stage-ui/stores/settings/stage-model'
import { useTheme } from '@angela/ui'
import { defineInvokeHandler } from '@moeru/eventa'
import { isEqual } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronGetServerChannelConfig,
  electronGodotStageGetStatus,
  electronGodotStageStatusChanged,
  electronSettingsNavigate,
  i18nGetLocale,
  i18nSetLocale,
} from '../shared/eventa'
import { localConfigRead, localConfigUpdate } from '../shared/eventa/local-config'
import { electronModelAssetCancel, electronModelAssetEnsure, electronModelAssetRemove, electronModelAssetsClear, electronModelAssetsList, electronModelAssetStatusChanged } from '../shared/eventa/model-assets'
import {
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa/plugin/capabilities'
import {
  electronPluginCancelDirectoryImport,
  electronPluginCommitDirectoryImport,
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginPrepareDirectoryImport,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../shared/eventa/plugin/host'
import { electronPluginToolsChanged } from '../shared/eventa/plugin/tools'
import { initializeElectronAuthCallbackBridge } from './bridges/electron-auth-callback'
import { initializeIOTraceRecordingBridge } from './bridges/io-trace-recording'
import { initializeStageThreeRuntimeTraceBridge } from './bridges/stage-three-runtime-trace'
import { useCompanionFollowUps } from './composables/use-companion-follow-ups'
import { useCompanionRuntime } from './composables/use-companion-runtime'
import { useLanguage } from './composables/use-language'
import { useLearningReviewReminders } from './composables/use-learning-review-reminders'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'
import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'
import {
  useTamagotchiBuiltinToolsStore,
  useTamagotchiHomeAssistantStore,
  useTamagotchiMcpToolsStore,
  useTamagotchiPluginToolsStore,
} from './stores/tools'
import { resolveInitialRendererRoutePath, resolveRendererWindowContext } from './window-context'

const { isDark: dark } = useTheme()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const router = useRouter()
const route = useRoute()
const context = useElectronEventaContext()
const { t } = useI18n()
const readLocalConfig = useElectronEventaInvoke(localConfigRead)
const updateLocalConfig = useElectronEventaInvoke(localConfigUpdate)
const listModelAssets = useElectronEventaInvoke(electronModelAssetsList)
const ensureModelAsset = useElectronEventaInvoke(electronModelAssetEnsure)
const cancelModelAsset = useElectronEventaInvoke(electronModelAssetCancel)
const removeModelAsset = useElectronEventaInvoke(electronModelAssetRemove)
const clearModelAssets = useElectronEventaInvoke(electronModelAssetsClear)
const stopModelAssetStatus = context.value.on(electronModelAssetStatusChanged, (event) => {
  if (event.body && !isSherpawModelBundled(event.body.id))
    updateModelAssetStatus(event.body)
})
setSherpawModelAssetHost({
  fetch: (model, fileName, signal) => fetch(
    `airi-model://assets/${encodeURIComponent(model.id)}/${encodeURIComponent(model.revision)}/${fileName}`,
    { signal },
  ),
  list: listModelAssets,
  ensure: ensureModelAsset,
  cancel: cancelModelAsset,
  remove: removeModelAsset,
  clear: clearModelAssets,
})
const getMainLocale = useElectronEventaInvoke(i18nGetLocale)
const setLocale = useElectronEventaInvoke(i18nSetLocale)
const windowContext = resolveRendererWindowContext()
const initialRoutePath = resolveInitialRendererRoutePath(route.path)
const chatStore = useChatStore()
const builtinToolsStore = useTamagotchiBuiltinToolsStore()
const homeAssistantStore = useTamagotchiHomeAssistantStore()
const mcpToolsStore = useTamagotchiMcpToolsStore()
const pluginToolsStore = useTamagotchiPluginToolsStore()
const syncedPinia = usePiniaSynced()
useCompanionRuntime()
useLearningReviewReminders()
if (initialRoutePath === '/')
  useCompanionFollowUps()
const isSpotlightWindow = initialRoutePath === '/spotlight'
// The floating chat resizes from its own grip, which keeps the corner beside the character in place.
const isFloatingChatWindow = initialRoutePath === '/chat-floating'
const isSettingsWindow = initialRoutePath === '/settings' || initialRoutePath.startsWith('/settings/')
const stopIOTraceRecordingBridge = initialRoutePath === '/'
  ? initializeIOTraceRecordingBridge(context.value)
  : undefined

async function refreshPluginRuntimeTools() {
  try {
    await pluginToolsStore.refresh()
  }
  catch (error) {
    console.warn('[App] Failed to refresh plugin runtime tools:', error)
  }
}

// Every renderer creates the runtime tool stores for synchronized state. Only
// the main Stage renderer discovers tools and keeps executors.
const stopLeadershipListener = syncedPinia.onLeadershipChange((isLeader) => {
  if (!isLeader)
    return

  void builtinToolsStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh built-in runtime tools:', error)
  })
  void mcpToolsStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh MCP runtime tools:', error)
  })
  void homeAssistantStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh Home Assistant tools:', error)
  })
  void refreshPluginRuntimeTools()
})

function createFullStageRuntime() {
  const authStore = useAuthStore()
  const onboardingStore = useOnboardingStore()
  const contextBridgeStore = useContextBridgeStore()
  const displayModelsStore = useDisplayModelsStore()
  const serverChannelSettingsStore = useServerChannelSettingsStore()
  const cardStore = useAngelaCardStore()
  const serverChannelStore = useModsServerChannelStore()
  const characterOrchestratorStore = useCharacterOrchestratorStore()
  const inferencePreload = useInferencePreload()
  const pluginHostInspectorStore = usePluginHostInspectorStore()
  const stageWindowLifecycleStore = useStageWindowLifecycleStore()
  const settingsAudioDeviceStore = useSettingsAudioDevice()
  const artistryStore = useArtistryStore()
  useConsciousnessStore()
  useHearingStore()
  useSpeechStore()
  useSettingsStageModel()
  useVisionStore()

  let localConfig: Awaited<ReturnType<typeof connectLocalProviderConfig>> | undefined
  let stopAuthenticatedSetup: (() => void) | undefined
  let stopLoggedOutSetup: (() => void) | undefined

  async function removeAuthenticationProviderConfiguration() {
    if (!syncedPinia.isLeader())
      return

    await cardStore.configureForAuthentication(false)
  }

  function registerAuthenticatedSetup() {
    stopAuthenticatedSetup ??= authStore.onAuthenticated(async () => {
      if (!syncedPinia.isLeader())
        return

      await cardStore.configureForAuthentication(true)
      await onboardingStore.closeAfterAuthentication()
    })
    stopLoggedOutSetup ??= authStore.onLogout(removeAuthenticationProviderConfiguration)
  }

  const { activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions } = storeToRefs(artistryStore)
  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const preparePluginDirectoryImport = useElectronEventaInvoke(electronPluginPrepareDirectoryImport)
  const commitPluginDirectoryImport = useElectronEventaInvoke(electronPluginCommitDirectoryImport)
  const cancelPluginDirectoryImport = useElectronEventaInvoke(electronPluginCancelDirectoryImport)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const setPluginAutoReload = useElectronEventaInvoke(electronPluginSetAutoReload)
  const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
  const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
  const getGodotStageStatus = useElectronEventaInvoke(electronGodotStageGetStatus)
  const syncArtistryConfig = useElectronEventaInvoke(artistrySyncConfig)
  const usesGodotStage = initialRoutePath === '/' || initialRoutePath.startsWith('/settings')
  const isWidgetsWindow = initialRoutePath === '/widgets'

  function syncGodotStageRenderer(state: { state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' }) {
    if (state.state === 'running') {
      settingsStore.setStageModelRenderer('godot')
      return
    }

    if ((state.state === 'stopped' || state.state === 'error') && settingsStore.stageModelRenderer === 'godot')
      settingsStore.restoreBuiltInStageModelRenderer()
  }

  usePerfTracerBridgeStore()
  initializeStageThreeRuntimeTraceBridge()
  // The main process returns the callback only to the renderer that started
  // sign-in. Each login-capable window listens locally, while the synchronized
  // auth action still executes once in the main Stage leader.
  initializeElectronAuthCallbackBridge()
  void stageWindowLifecycleStore.initializeWindowLifecycleBridge()

  contextBridgeStore.setSparkNotifyHostRole(isWidgetsWindow ? 'client' : 'main')

  // NOTICE: register plugin host bridge during setup to avoid race with pages using it in immediate watchers.
  pluginHostInspectorStore.setBridge({
    prepareDirectoryImport: () => preparePluginDirectoryImport(),
    commitDirectoryImport: payload => commitPluginDirectoryImport(payload),
    cancelDirectoryImport: payload => cancelPluginDirectoryImport(payload),
    list: () => listPlugins(),
    setEnabled: async (payload) => {
      const result = await setPluginEnabled(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    setAutoReload: payload => setPluginAutoReload(payload),
    loadEnabled: async () => {
      const result = await loadEnabledPlugins()
      await refreshPluginRuntimeTools()
      return result
    },
    load: async (payload) => {
      const result = await loadPlugin(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    unload: async (payload) => {
      const result = await unloadPlugin(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    inspect: () => inspectPluginHost(),
  })

  let lastSyncedArtistryConfig: ArtistrySyncPayload | undefined
  watch([activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions], () => {
    if (!activeProvider.value)
      return

    const config = JSON.parse(JSON.stringify({
      provider: activeProvider.value,
      globals: artistryGlobals.value,
      model: activeModel.value,
      promptPrefix: defaultPromptPrefix.value,
      options: providerOptions.value,
    })) as ArtistrySyncPayload
    if (isEqual(config, lastSyncedArtistryConfig))
      return

    // Pinia synchronization applies cloned snapshots in every renderer. Keep
    // this IPC bridge edge-triggered so equal snapshots do not repeat IO.
    lastSyncedArtistryConfig = config
    void syncArtistryConfig(config)
  }, { deep: true, immediate: true })

  context.value.on(electronGodotStageStatusChanged, (event) => {
    if (!event.body) {
      return
    }

    syncGodotStageRenderer(event.body)
  })

  context.value.on(electronPluginToolsChanged, () => {
    void refreshPluginRuntimeTools()
  })

  return {
    async initialize() {
      initializeAnalytics()
      await authStore.initialize()
      await displayModelsStore.initialize()
      await cardStore.initialize()
      registerAuthenticatedSetup()
      if (!authStore.isAuthenticated)
        await removeAuthenticationProviderConfiguration()

      localConfig?.stop()
      localConfig = await connectLocalProviderConfig({ read: readLocalConfig, update: updateLocalConfig }, () => syncedPinia.isLeader(), () => {
        toast.error(t('stage.local-config-error'))
      })
      await displayModelsStore.loadDisplayModelsFromIndexedDB()
      await settingsStore.initializeStageModel()
      await settingsAudioDeviceStore.initialize()

      if (usesGodotStage) {
        try {
          syncGodotStageRenderer(await getGodotStageStatus())
        }
        catch (error) {
          console.warn('[App] Failed to fetch Godot stage status:', error)
        }
      }

      const serverChannelConfig = await getServerChannelConfig()
      serverChannelSettingsStore.tlsConfig = serverChannelConfig.tlsConfig ?? null
      serverChannelSettingsStore.hostname = serverChannelConfig.hostname
      serverChannelSettingsStore.authToken = serverChannelConfig.authToken

      await serverChannelStore.initialize({
        token: serverChannelConfig.authToken || undefined,
        possibleEvents: ['ui:configure'],
      }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
      contextBridgeStore.initialize()
      if (!isWidgetsWindow) {
        characterOrchestratorStore.initialize()
      }

      defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

      if (shouldPublishPluginHostCapabilities()) {
        await reportPluginCapability({
          key: pluginProtocolListProvidersEventName,
          state: 'ready',
          metadata: {
            source: 'stage-ui',
          },
        })
      }

      inferencePreload.triggerPreload()
    },
    dispose() {
      localConfig?.stop()
      stopAuthenticatedSetup?.()
      stopLoggedOutSetup?.()
      contextBridgeStore.dispose()
    },
  }
}

const fullStageRuntime = windowContext.stageRuntime === 'full'
  ? createFullStageRuntime()
  : null

const { restore: restoreLocale } = useLanguage(language, getMainLocale, setLocale)

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

if (isSettingsWindow) {
  context.value.on(electronSettingsNavigate, (event) => {
    const targetRoute = event?.body?.route
    if (!targetRoute || route.fullPath === targetRoute) {
      return
    }

    void router.push(targetRoute).catch((error) => {
      console.warn('Failed to navigate settings window:', error)
    })
  })
}

onMounted(async () => {
  void listModelAssets().then((statuses) => {
    for (const status of statuses) {
      if (!isSherpawModelBundled(status.id))
        updateModelAssetStatus(status)
    }
  }).catch(error => console.warn('Failed to read model asset status:', error))

  // NOTICE: Issue #1658
  // When Electron restarts, renderer localStorage may not be flushed to disk.
  // The store's onMounted hook falls back to navigator.language, which triggers
  // watch(language) and overwrites the main-process config with the OS locale.
  // We must restore the correct locale from main process before allowing sync.
  // https://github.com/moeru-ai/airi/issues/1658
  await restoreLocale()

  await chatStore.initialize(syncedPinia)

  await fullStageRuntime?.initialize()
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => {
  stopIOTraceRecordingBridge?.()
  stopModelAssetStatus()
  stopLeadershipListener?.()
  chatStore.dispose()
  fullStageRuntime?.dispose()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler v-if="!isSpotlightWindow && !isFloatingChatWindow" />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
