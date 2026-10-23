import type { RawFaceObservation } from './observation'

import * as v from 'valibot'

/** Observable cues only. Confidence describes tracker evidence, not certainty about a person's feelings. */
export interface AffectState {
  facePresent: boolean
  expression: 'neutral' | 'smile' | 'unknown'
  attention: 'screen' | 'away' | 'unknown'
  confidence: number
  stableForMs: number
  observedAt: number
}

const duration = v.pipe(v.number(), v.finite(), v.minValue(100), v.maxValue(30_000))
const settingsSchema = v.strictObject({
  windowMs: v.optional(duration, 1000),
  staleMs: v.optional(duration, 2000),
  faceDebounceMs: v.optional(duration, 400),
  expressionDebounceMs: v.optional(duration, 700),
  awayDebounceMs: v.optional(duration, 1800),
  screenDebounceMs: v.optional(duration, 600),
  sampleGapMs: v.optional(duration, 500),
})

class StableCue<T> {
  private candidate: T
  private candidateAt = 0
  private samples = 0
  since = 0

  constructor(public value: T) {
    this.candidate = value
  }

  update(value: T, timestamp: number, delay: number) {
    if (this.candidate !== value || this.samples === 0) {
      this.candidate = value
      this.candidateAt = timestamp
      this.samples = 0
    }
    this.samples++
    if ((value !== this.value || this.since === 0) && this.samples >= 3 && timestamp - this.candidateAt >= delay) {
      this.value = value
      this.since = timestamp
    }
  }
}

/** Owns a bounded rolling window and independent debouncers. Reads expire stale evidence without a background timer. */
export class AffectEngine {
  private observations: RawFaceObservation[] = []
  private face = new StableCue(false)
  private expression = new StableCue<AffectState['expression']>('unknown')
  private attention = new StableCue<AffectState['attention']>('unknown')
  private readonly settings: v.InferOutput<typeof settingsSchema>

  constructor(settings: v.InferInput<typeof settingsSchema> = {}) {
    this.settings = v.parse(settingsSchema, settings)
  }

  reset() {
    this.observations = []
    this.face = new StableCue(false)
    this.expression = new StableCue<AffectState['expression']>('unknown')
    this.attention = new StableCue<AffectState['attention']>('unknown')
  }

  /** Rejects replayed, stale, future, and out-of-order observations. The caller uses one clock for receipt and context reads. */
  observe(observation: RawFaceObservation, now = Date.now()) {
    const latest = this.observations.at(-1)
    if (observation.timestamp > now + 250 || now - observation.timestamp > this.settings.staleMs || (latest && observation.timestamp <= latest.timestamp))
      return
    // A long gap breaks continuity. Two isolated frames cannot establish a sustained cue.
    if (latest && observation.timestamp - latest.timestamp > this.settings.sampleGapMs)
      this.reset()
    this.observations.push(observation)
    this.observations = this.observations.filter(item => observation.timestamp - item.timestamp <= this.settings.windowMs).slice(-300)
    const reliable = this.observations.filter(item => item.faceDetected && item.confidence >= 0.65)
    const ratio = reliable.length / this.observations.length
    this.face.update(ratio >= 0.8, observation.timestamp, this.settings.faceDebounceMs)
    if (!this.face.value || ratio < 0.8) {
      this.expression.update('unknown', observation.timestamp, 100)
      this.attention.update('unknown', observation.timestamp, 100)
      return
    }

    const features = reliable.flatMap(item => item.features ? [item.features] : [])
    let expression: AffectState['expression'] = 'unknown'
    if (features.length >= reliable.length * 0.8) {
      const smile = features.reduce((sum, item) => sum + item.smileLike, 0) / features.length
      const mouth = features.reduce((sum, item) => sum + item.mouthOpen, 0) / features.length
      if (smile >= 0.65 && mouth <= 0.45)
        expression = 'smile'
      else if (smile <= 0.25 && mouth <= 0.25)
        expression = 'neutral'
    }
    this.expression.update(expression, observation.timestamp, this.settings.expressionDebounceMs)

    const poses = reliable.flatMap(item => item.headPose ? [item.headPose] : [])
    let attention: AffectState['attention'] = 'unknown'
    if (poses.length >= reliable.length * 0.8) {
      // Average absolute offsets so alternating left/right turns cannot cancel into a screen cue.
      const yaw = poses.reduce((sum, item) => sum + Math.abs(item.yaw), 0) / poses.length
      const pitch = poses.reduce((sum, item) => sum + Math.abs(item.pitch), 0) / poses.length
      if (yaw <= 18 && pitch <= 15)
        attention = 'screen'
      else if (yaw >= 30 || pitch >= 25)
        attention = 'away'
    }
    this.attention.update(attention, observation.timestamp, attention === 'away' ? this.settings.awayDebounceMs : this.settings.screenDebounceMs)
  }

  getState(now = Date.now()): AffectState {
    const latest = this.observations.at(-1)
    if (!latest || now - latest.timestamp > this.settings.staleMs || now < latest.timestamp - 250) {
      this.reset()
      return { facePresent: false, expression: 'unknown', attention: 'unknown', confidence: 0, stableForMs: 0, observedAt: 0 }
    }
    const confidence = this.observations.reduce((sum, item) => sum + item.confidence, 0) / this.observations.length
    return {
      facePresent: this.face.value,
      expression: this.face.value ? this.expression.value : 'unknown',
      attention: this.face.value ? this.attention.value : 'unknown',
      confidence: this.face.value ? confidence : 0,
      stableForMs: this.face.since === 0 ? 0 : Math.max(0, latest.timestamp - Math.max(this.face.since, this.expression.since, this.attention.since)),
      observedAt: latest.timestamp,
    }
  }
}
