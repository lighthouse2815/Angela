import type { LessonContext } from '@angela/companion/internet'

import { defineInvokeEventa } from '@moeru/eventa'

/** Playback positions and windows use seconds. Omitted URLs select the connected current lesson tab. */
export interface VideoResearchRequest {
  action: 'around' | 'recent' | 'search' | 'transcript' | 'summarize' | 'summarize-recent'
  url?: string
  timestamp?: number
  beforeSeconds?: number
  afterSeconds?: number
  recentSeconds?: number
  query?: string
}

/** Local readiness and successful evidence are distinct states. Diagnostics never upload media. */
export interface InternetDiagnostic {
  capability: string
  status: 'READY' | 'NEED_SETUP' | 'UNVERIFIED' | 'UNAVAILABLE' | 'NOT_INTEGRATED'
  detail: string
}

export const videoResearch = defineInvokeEventa<LessonContext | object, VideoResearchRequest>('eventa:invoke:internet:video')
export const internetDiagnostics = defineInvokeEventa<InternetDiagnostic[]>('eventa:invoke:internet:diagnostics')
