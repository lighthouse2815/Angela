import { defineEventa } from '@moeru/eventa'

import * as v from 'valibot'

const unit = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1))
const nonnegative = v.pipe(v.number(), v.finite(), v.minValue(0))
const angle = v.pipe(v.number(), v.finite(), v.minValue(-180), v.maxValue(180))

/** Provider-neutral, derived observations. No identity, landmarks, or media cross this boundary. */
export const observationSchema = v.strictObject({
  type: v.literal('face_observation'),
  timestamp: v.pipe(nonnegative, v.integer()),
  faceDetected: v.boolean(),
  confidence: unit,
  headPose: v.optional(v.strictObject({ yaw: angle, pitch: angle, roll: angle })),
  features: v.optional(v.strictObject({ smileLike: unit, mouthOpen: unit })),
  metrics: v.optional(v.strictObject({
    captureFps: nonnegative,
    processedFps: nonnegative,
    latencyMs: nonnegative,
    droppedFrames: v.pipe(nonnegative, v.integer()),
  })),
})

/** Wall-clock milliseconds identify capture freshness. Pose angles are relative to a frontal camera pose, in degrees. */
export type RawFaceObservation = v.InferOutput<typeof observationSchema>

/** Validated Python transport events enter a provider-local Eventa context. No events leak between camera instances. */
export const faceObservation = defineEventa<RawFaceObservation>('angela:camera:face-observation')

/** JSONL envelopes shared with python/camera-worker/worker.py. Unknown fields fail closed. */
export const workerEventSchema = v.variant('type', [
  observationSchema,
  v.strictObject({ type: v.literal('ready') }),
  v.strictObject({
    type: v.literal('error'),
    code: v.picklist(['source_missing', 'model_missing', 'dependencies_missing', 'opencv_unavailable', 'numpy_unavailable', 'onnxruntime_unavailable', 'model_load_failed', 'camera_unavailable', 'camera_disconnected', 'tracking_failed', 'worker_failed']),
  }),
])

/** Camera-independent perception boundary. start resolves after readiness. stop releases the child before resolving. */
export interface FacePerceptionProvider {
  readonly status: { state: 'off' | 'starting' | 'on' | 'error', error?: string, invalidEvents: number }
  start: () => Promise<void>
  stop: () => Promise<void>
  getLatestObservation: () => RawFaceObservation | undefined
  subscribe: (listener: (observation: RawFaceObservation) => void) => () => void
}
