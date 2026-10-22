import { expect, it } from 'vitest'

import * as v from 'valibot'

import { workerEventSchema } from './observation'

it('validates the protocol envelopes and derived observations', () => {
  expect(v.safeParse(workerEventSchema, { type: 'ready' }).success).toBe(true)
  expect(v.safeParse(workerEventSchema, { type: 'error', code: 'camera_unavailable' }).success).toBe(true)
  expect(v.safeParse(workerEventSchema, { type: 'face_observation', timestamp: 1000, faceDetected: false, confidence: 0 }).success).toBe(true)
})

it.each([
  { type: 'error', code: 'arbitrary unbounded output' },
  { type: 'face_observation', timestamp: -1, faceDetected: true, confidence: 1 },
  { type: 'face_observation', timestamp: 1000, faceDetected: true, confidence: Number.NaN },
  { type: 'face_observation', timestamp: 1000, faceDetected: true, confidence: 1.1 },
  { type: 'face_observation', timestamp: 1000, faceDetected: true, confidence: 1, headPose: { yaw: Infinity, pitch: 0, roll: 0 } },
  { type: 'face_observation', timestamp: 1000, faceDetected: true, confidence: 1, image: 'raw pixels' },
  { type: 'face_observation', timestamp: 1000, faceDetected: true, confidence: 1, features: { smileLike: 0.9, mouthOpen: 0.1, identity: 'person' } },
])('rejects invalid or sensitive protocol payloads: %j', (payload) => {
  expect(v.safeParse(workerEventSchema, payload).success).toBe(false)
})
