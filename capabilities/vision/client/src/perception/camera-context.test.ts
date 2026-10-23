import type { AffectState } from './affect-engine'

import { expect, it } from 'vitest'

import { CameraContextProvider } from './camera-context'

const stable: AffectState = { facePresent: true, expression: 'smile', attention: 'screen', confidence: 0.85, stableForMs: 2000, observedAt: 10_000 }

it('includes unchanged fresh state in every request while limiting cue commentary only', () => {
  const context = new CameraContextProvider()
  const first = context.getContext(stable, 10_000)
  expect(first).toContain('uncertain soft cues')
  expect(first).toContain('expression=smile')
  expect(first).toContain('Never state these cues as facts')
  expect(first!.length).toBeLessThan(1000)
  expect(first).toContain('camera_reaction=allowed')
  for (const now of [10_000, 10_100, 11_000, 15_000, 30_000]) {
    const repeated = context.getContext({ ...stable, observedAt: now }, now)
    expect(repeated).toContain('face_present=true, expression=smile, attention=screen')
    expect(repeated).toContain('camera_reaction=quiet')
  }
  const refreshed = context.getContext({ ...stable, observedAt: 70_000 }, 70_000)
  expect(refreshed).toContain('expression=smile')
  expect(refreshed).toContain('camera_reaction=allowed')
  context.reset()
  expect(context.getContext(stable, 10_000)).toContain('camera_reaction=allowed')
})

it('includes changed cues immediately, even during the reaction cooldown', () => {
  const context = new CameraContextProvider()
  context.getContext(stable, 10_000)
  const changed = context.getContext({ ...stable, attention: 'away', observedAt: 11_000 }, 11_000)
  expect(changed).toContain('attention=away')
  expect(changed).toContain('camera_reaction=quiet')
  expect(context.getContext({ ...stable, attention: 'away', observedAt: 20_000 }, 20_000)).toContain('camera_reaction=allowed')
})

it('omits stale, future, weak and unstable evidence', () => {
  const context = new CameraContextProvider()
  expect(context.getContext(stable, 12_001)).toBeUndefined()
  expect(context.getContext(stable, 9000)).toBeUndefined()
  expect(context.getContext({ ...stable, confidence: 0.4 }, 10_000)).toBeUndefined()
  expect(context.getContext({ ...stable, stableForMs: 80 }, 10_000)).toBeUndefined()
  expect(context.getContext({ ...stable, observedAt: 0 }, 10_000)).toBeUndefined()
})
