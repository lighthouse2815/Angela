import type { RawFaceObservation } from './observation'

import { describe, expect, it } from 'vitest'

import { AffectEngine } from './affect-engine'

function sample(timestamp: number, changes: Partial<RawFaceObservation> = {}): RawFaceObservation {
  return { type: 'face_observation', timestamp, confidence: 0.9, faceDetected: true, features: { smileLike: 0.05, mouthOpen: 0.1 }, headPose: { yaw: 0, pitch: 0, roll: 0 }, ...changes }
}

function feed(engine: AffectEngine, from: number, to: number, changes: Partial<RawFaceObservation> = {}) {
  for (let time = from; time <= to; time += 100)
    engine.observe(sample(time, changes), time)
  return engine.getState(to)
}

describe('temporal affect cues', () => {
  it('starts unknown and requires multiple observations over time', () => {
    const engine = new AffectEngine()
    engine.observe(sample(1000), 1000)
    expect(engine.getState(1000).facePresent).toBe(false)
    expect(engine.getState(1000).expression).toBe('unknown')
    expect(feed(engine, 1100, 3000)).toMatchObject({ facePresent: true, expression: 'neutral', attention: 'screen' })
    expect(engine.getState(3000).confidence).toBeCloseTo(0.9)
    expect(engine.getState(3000).stableForMs).toBeGreaterThan(0)
  })

  it('does not treat initial absence or a single frame as stable evidence', () => {
    const engine = new AffectEngine()
    engine.observe(sample(1_790_000_000_000, { faceDetected: false, confidence: 0 }), 1_790_000_000_000)
    expect(engine.getState(1_790_000_000_000).stableForMs).toBe(0)
    expect(feed(engine, 1_790_000_000_100, 1_790_000_001_500, { faceDetected: false, confidence: 0 }).stableForMs).toBeGreaterThan(500)
  })

  it('rejects an 80ms smile spike and accepts a sustained smile', () => {
    const engine = new AffectEngine()
    feed(engine, 1000, 3000)
    engine.observe(sample(3080, { features: { smileLike: 1, mouthOpen: 0.1 } }), 3080)
    expect(feed(engine, 3100, 4500).expression).toBe('neutral')
    expect(feed(engine, 4600, 7000, { features: { smileLike: 0.9, mouthOpen: 0.1 } }).expression).toBe('smile')
  })

  it('debounces missing faces and clears expression/attention when absent', () => {
    const engine = new AffectEngine()
    feed(engine, 1000, 3000)
    engine.observe(sample(3100, { faceDetected: false, confidence: 0 }), 3100)
    expect(engine.getState(3100).facePresent).toBe(true)
    expect(feed(engine, 3200, 5000, { faceDetected: false, confidence: 0 })).toMatchObject({ facePresent: false, expression: 'unknown', attention: 'unknown', confidence: 0 })
  })

  it('rejects a brief look away and accepts sustained yaw/pitch offsets', () => {
    const engine = new AffectEngine()
    feed(engine, 1000, 3000)
    feed(engine, 3100, 3300, { headPose: { yaw: 45, pitch: 0, roll: 0 } })
    expect(feed(engine, 3400, 5000).attention).toBe('screen')
    expect(feed(engine, 5100, 9000, { headPose: { yaw: 40, pitch: 0, roll: 0 } }).attention).toBe('away')
    engine.reset()
    expect(feed(engine, 1000, 5000, { headPose: { yaw: 0, pitch: -35, roll: 0 } }).attention).toBe('away')
  })

  it('does not average alternating head turns into a screen cue', () => {
    const engine = new AffectEngine()
    for (let time = 1000; time <= 6000; time += 100)
      engine.observe(sample(time, { headPose: { yaw: time % 200 === 0 ? 40 : -40, pitch: 0, roll: 0 } }), time)
    expect(engine.getState(6000).attention).toBe('away')
  })

  it('returns unknown for weak confidence, missing features, and ambiguous geometry', () => {
    const engine = new AffectEngine()
    expect(feed(engine, 1000, 4000, { confidence: 0.4 }).facePresent).toBe(false)
    engine.reset()
    expect(feed(engine, 1000, 4000, { features: undefined, headPose: undefined })).toMatchObject({ facePresent: true, expression: 'unknown', attention: 'unknown' })
    expect(feed(engine, 4100, 7000, { features: { smileLike: 0.45, mouthOpen: 0.1 }, headPose: { yaw: 23, pitch: 20, roll: 0 } })).toMatchObject({ expression: 'unknown', attention: 'unknown' })
    expect(feed(engine, 7100, 10_000, { features: { smileLike: 0.9, mouthOpen: 0.9 } }).expression).toBe('unknown')
  })

  it('propagates confidence and expires the state without another frame', () => {
    const engine = new AffectEngine()
    expect(feed(engine, 1000, 4000, { confidence: 0.72 }).confidence).toBeCloseTo(0.72)
    expect(engine.getState(6001)).toEqual({ facePresent: false, expression: 'unknown', attention: 'unknown', confidence: 0, observedAt: 0, stableForMs: 0 })
    engine.observe(sample(6100), 6100)
    expect(engine.getState(6100).facePresent).toBe(false)
  })

  it('rejects replay, stale and future timestamps and breaks continuity across gaps', () => {
    const engine = new AffectEngine()
    engine.observe(sample(1000), 1000)
    engine.observe(sample(1000), 2000)
    engine.observe(sample(900), 2000)
    engine.observe(sample(4000), 2000)
    engine.observe(sample(1001), 4000)
    expect(engine.getState(1000).observedAt).toBe(1000)
    engine.observe(sample(1600), 1600)
    expect(engine.getState(1600).facePresent).toBe(false)
  })

  it('supports a configured window and debounce, with bounded valid durations', () => {
    const engine = new AffectEngine({ windowMs: 200, faceDebounceMs: 100, expressionDebounceMs: 100, screenDebounceMs: 100 })
    expect(feed(engine, 1000, 1600)).toMatchObject({ facePresent: true, expression: 'neutral', attention: 'screen' })
    expect(() => new AffectEngine({ windowMs: 0 })).toThrow()
  })
})
