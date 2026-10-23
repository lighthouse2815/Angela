import { usePiniaSynced } from '@angela/stage-ui/libs/pinia'
import { useSpeakingStore } from '@angela/stage-ui/stores/audio'
import { useChatStore } from '@angela/stage-ui/stores/chat'
import { useAngelaCardStore } from '@angela/stage-ui/stores/modules/angela-card'
import { useCompanionStore } from '@angela/stage-ui/stores/modules/companion'
import { useLearningMemoryStore } from '@angela/stage-ui/stores/modules/learning-memory'
import { useDocumentVisibility, useIdle, useIntervalFn } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

/** The visible Stage leader presents one reserved follow-up while idle. Disposal stops polling and removes its toast. */
export function useCompanionFollowUps() {
  const store = useCompanionStore()
  const memory = useLearningMemoryStore()
  const cards = useAngelaCardStore()
  const chat = useChatStore()
  const speaking = useSpeakingStore()
  const runtime = usePiniaSynced()
  const visibility = useDocumentVisibility()
  const { idle, stop: stopIdle } = useIdle(60000)
  const { t } = useI18n()
  let disposed = false
  let checking = false
  let toastId: string | number | undefined
  let shownEntry: { characterId: string, id: string } | undefined

  function available() {
    return !disposed && runtime.isLeader() && store.state.enabled && memory.enabled
      && visibility.value === 'visible' && idle.value && !chat.sending && !speaking.nowSpeaking
  }

  async function check() {
    if (checking || !available())
      return
    checking = true
    const characterId = cards.activeCardId
    try {
      const entry = await store.reservePrompt(characterId)
      if (!entry || !available() || cards.activeCardId !== characterId)
        return
      // Recheck after the routed action. A cancellation or deletion can occur while it waits for the leader.
      const current = store.forCharacter(characterId).find(item => item.id === entry.id)
      if (current?.status !== 'open')
        return
      shownEntry = { characterId, id: entry.id }
      toastId = toast(t(entry.kind === 'activity' ? 'base.companion.elapsed' : 'base.companion.prompt', { subject: entry.text }), {
        duration: 20000,
        action: {
          label: t('base.companion.dismiss'),
          onClick: () => {
            void store.resolve(characterId, entry.id, 'dismissed').catch(() => toast.error(t('base.companion.error')))
          },
        },
      })
    }
    catch (error) {
      console.warn('Companion follow-up failed:', error)
    }
    finally {
      checking = false
    }
  }

  const stopWatch = watch(() => [store.state, memory.enabled, cards.activeCardId, chat.sending, speaking.nowSpeaking, visibility.value], () => {
    if (toastId === undefined || !shownEntry)
      return
    const current = store.forCharacter(shownEntry.characterId).find(entry => entry.id === shownEntry?.id)
    if (!store.state.enabled || !memory.enabled || cards.activeCardId !== shownEntry.characterId
      || chat.sending || speaking.nowSpeaking || visibility.value !== 'visible' || current?.status !== 'open') {
      toast.dismiss(toastId)
      toastId = undefined
      shownEntry = undefined
    }
  })

  const interval = useIntervalFn(() => void check(), 15000)
  onScopeDispose(() => {
    disposed = true
    interval.pause()
    stopIdle()
    stopWatch()
    if (toastId !== undefined)
      toast.dismiss(toastId)
  })
}
