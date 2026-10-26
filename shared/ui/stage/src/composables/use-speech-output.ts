import type { TurnRef } from '@angela/core-agent'
import type { CaptionChannelEvent } from '@angela/stage-shared'

import { BrowserPlayback } from '@angela/audio/browser'
import { Playback } from '@angela/pipelines-audio'
import { defineInvokeHandler } from '@moeru/eventa'
import { sleep } from '@moeru/std'
import { useBroadcastChannel, useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

import { getSpeechBusContext, speechOutputGetPlaybackState, speechOutputPlaybackStateChangedEvent } from '../services/speech/bus'
import { useLlmStreamingControlStore } from '../stores/ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from '../stores/audio'
import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useAngelaCardStore } from '../stores/modules/angela-card'
import { useSpeechStore } from '../stores/modules/speech'
import { useSpeechOutputControlStore } from '../stores/speech-output-control'
import { useVoiceStore } from '../stores/voice'

/** Connects one renderer to speech playback and chat hooks. Scope disposal disconnects the output and its audio nodes. */
export function useSpeechOutput(options: {
  /** Prepares optional visualization before response text reaches synthesis. */
  beforeResponse?: () => Promise<void>
} = {}) {
  const voice = useVoiceStore()
  const chat = useChatStore()
  const sessions = useChatSessionStore()
  const cards = useAngelaCardStore()
  const speech = useSpeechStore()
  const streamingControl = useLlmStreamingControlStore()
  const { audioContext } = useAudioContext()
  const { mouthOpenSize, nowSpeaking } = storeToRefs(useSpeakingStore())
  const { speechMuted } = storeToRefs(useSpeechOutputControlStore())
  const speechVoicing = shallowRef(false)
  const currentAudioSource = ref<AudioBufferSourceNode>()
  const speechDestination = audioContext.createGain()
  speechDestination.connect(audioContext.destination)
  const playback = new Playback(new BrowserPlayback(audioContext, {
    destination: speechDestination,
    onSource: source => currentAudioSource.value = source,
  }))
  const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
  type PresentEvent = { type: 'assistant-reset' } | { type: 'assistant-append', text: string }
  const { post: postPresent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'airi-chat-present' })
  let playingCount = 0

  function resetSpeakingState() {
    nowSpeaking.value = false
    mouthOpenSize.value = 0
  }

  function present(text?: string) {
    try {
      postCaption({ type: 'caption-assistant', text: text ?? '' })
      postPresent(text === undefined ? { type: 'assistant-reset' } : { type: 'assistant-append', text })
    }
    catch (error) {
      console.error('Speech presentation channel failed', error)
    }
  }

  function playSpecialToken(special: string, turn: TurnRef) {
    return streamingControl.dispatchWith(special, { turnId: turn.turnId })
  }

  const disconnect = voice.connectOutput((turn) => {
    const output = {
      playback,
      onSpecial: (special: string) => void playSpecialToken(special, turn),
      onPlaybackStart: ({ text }: { text: string }) => {
        playingCount += 1
        nowSpeaking.value = true
        speechVoicing.value = true
        present(text)
      },
      onPlaybackEnd: () => {
        playingCount -= 1
        if (playingCount === 0)
          resetSpeakingState()
      },
    }
    if (speechMuted.value)
      return { ...output, synthesize: async () => null }
    try {
      const characterId = sessions.sessionMetas[turn.sessionId]?.characterId
      if (!characterId)
        throw new Error('The response session has no character')
      return speech.createOutput(turn, cards.getModules(characterId).speech, output, audioContext)
    }
    catch (error) {
      // Text replies remain available when optional speech output is not configured.
      console.error('Speech output is unavailable', error)
      return { ...output, synthesize: async () => null }
    }
  })

  const cleanups = [
    defineInvokeHandler(getSpeechBusContext(), speechOutputGetPlaybackState, () => ({ speaking: nowSpeaking.value, voicing: speechVoicing.value })),
    streamingControl.onSignal(async (signal) => {
      if (signal.type === 'delay')
        await sleep(signal.seconds * 1000)
    }),
    chat.onBeforeMessageComposed(async (_message, context) => {
      voice.startResponse(context)
      if (context.sessionId === sessions.activeSessionId) {
        resetSpeakingState()
        present()
      }
      await options.beforeResponse?.()
    }),
    chat.onTokenLiteral(async (literal, context) => {
      if (!speechMuted.value)
        await voice.getSpeech(context)?.write(literal)
    }),
    chat.onTokenSpecial(async (special, context) => {
      if (speechMuted.value)
        await playSpecialToken(special, context)
      else
        voice.getSpeech(context)?.special(special)
    }),
    chat.onStreamEnd(async (context) => {
      void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
    }),
    chat.onAssistantResponseEnd(async (_message, context) => {
      void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
    }),
  ]

  watch([nowSpeaking, speechVoicing], ([speaking, voicing]) => {
    getSpeechBusContext().emit(speechOutputPlaybackStateChangedEvent, { speaking, voicing })
  }, { immediate: true })
  watch(() => voice.activeTurns, (turns) => {
    if (turns.length === 0)
      speechVoicing.value = false
  })
  watch(speechMuted, (muted) => {
    if (muted) {
      for (const turn of voice.activeTurns)
        voice.getSpeech(turn)?.cancel('Speech muted')
    }
  })

  let audioContextResumed = false
  useEventListener(['click', 'touchstart', 'keydown'], () => {
    if (audioContextResumed)
      return
    audioContextResumed = true
    // Playback resumes the context again if the browser rejects this first interaction.
    void audioContext.resume().catch(error => console.warn('Speech audio context is waiting for playback', error))
  }, { once: true, passive: true })

  onScopeDispose(() => {
    cleanups.forEach(stop => stop())
    disconnect()
    resetSpeakingState()
    speechDestination.disconnect()
  })

  return { audioContext, currentAudioSource, speechDestination }
}
