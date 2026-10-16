import type { AffectState } from './affect-engine'

/** Limits request-only cues to stable, fresh changes. No unsolicited messages or durable observations are produced. */
export class CameraContextProvider {
  private lastKey = ''
  private lastSent = Number.NEGATIVE_INFINITY

  reset() {
    this.lastKey = ''
    this.lastSent = Number.NEGATIVE_INFINITY
  }

  getContext(state: AffectState, now = Date.now()): string | undefined {
    if (!state.observedAt || now - state.observedAt > 2000 || now < state.observedAt - 250 || state.stableForMs < 500)
      return undefined
    if (state.facePresent && state.confidence < 0.65)
      return undefined
    const key = `${state.facePresent}:${state.expression}:${state.attention}`
    // Changed cues wait ten seconds. Identical cues refresh at most once per minute.
    if (now - this.lastSent < (key === this.lastKey ? 60_000 : 10_000))
      return undefined
    this.lastSent = now
    this.lastKey = key
    return `Visual context (camera, uncertain soft cues, current request only): face_present=${state.facePresent}, expression=${state.expression}, attention=${state.attention}, tracker_confidence=${state.confidence.toFixed(2)}. Head direction approximates screen attention, not eye gaze. Neutral means no clear smile cue. Use only to gently adjust tone or explanation pace when relevant. Do not announce every change or infer feelings, understanding, diagnoses, identity, sensitive traits, or deception. Never state these cues as facts about the user's inner state. Prefer a gentle question when useful. The user's words take priority.`
  }
}
