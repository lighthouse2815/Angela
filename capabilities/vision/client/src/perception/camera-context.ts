import type { AffectState } from './affect-engine'

/** Supplies current stable cues for every request. Reaction opportunities affect commentary guidance only, never state availability. */
export class CameraContextProvider {
  private lastReactionKey = ''
  private lastReactionOpportunityAt = Number.NEGATIVE_INFINITY

  reset() {
    this.lastReactionKey = ''
    this.lastReactionOpportunityAt = Number.NEGATIVE_INFINITY
  }

  getContext(state: AffectState, now = Date.now()): string | undefined {
    if (!state.observedAt || now - state.observedAt > 2000 || now < state.observedAt - 250 || state.stableForMs < 500)
      return undefined
    if (state.facePresent && state.confidence < 0.65)
      return undefined
    return `Visual context (camera, uncertain soft cues, current request only): face_present=${state.facePresent}, expression=${state.expression}, attention=${state.attention}, tracker_confidence=${state.confidence.toFixed(2)}. Head direction approximates screen attention, not eye gaze. Neutral means no clear smile cue. Use only to gently adjust tone or explanation pace when relevant. Do not infer feelings, understanding, diagnoses, identity, sensitive traits, or deception. Never state these cues as facts about the user's inner state. The user's words take priority. ${this.reactionGuidance(state, now)}`
  }

  private reactionGuidance(state: AffectState, now: number) {
    const key = `${state.facePresent}:${state.expression}:${state.attention}`
    const interval = key === this.lastReactionKey ? 60_000 : 10_000
    if (now - this.lastReactionOpportunityAt < interval)
      return 'camera_reaction=quiet. Do not volunteer comments about camera cues in this reply. You can still adapt tone or pace. Answer explicit cue questions cautiously.'
    // This grants an opportunity, not evidence that the model used or mentioned a cue.
    this.lastReactionOpportunityAt = now
    this.lastReactionKey = key
    return 'camera_reaction=allowed. A brief cue-related question is allowed only when useful. Do not announce every change.'
  }
}
