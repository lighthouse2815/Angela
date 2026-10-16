import type { AffectState } from './affect-engine'

import { expect, it } from 'vitest'

import { CameraContextProvider } from './camera-context'

const stable: AffectState = { facePresent: true, expression: 'smile', attention: 'screen', confidence: 0.85, stableForMs: 2000, observedAt: 10_000 }

it('emits compact advisory context, respects cooldown and refreshes unchanged cues once per minute', () => {
  const context = new CameraContextProvider()
  const first = context.getContext(stable, 10_000)
  expect(first).toContain('uncertain soft cues')
  expect(first).toContain('expression=smile')
  expect(first).toContain('Never state these cues as facts')
  expect(first!.length).toBeLessThan(1000)
  expect(context.getContext(stable, 11_000)).toBeUndefined()
  expect(context.getContext({ ...stable, attention: 'away', observedAt: 15_000 }, 15_000)).toBeUndefined()
  expect(context.getContext({ ...stable, attention: 'away', observedAt: 21_000 }, 21_000)).toContain('attention=away')
  expect(context.getContext({ ...stable, attention: 'away', observedAt: 30_000 }, 30_000)).toBeUndefined()
  expect(context.getContext({ ...stable, attention: 'away', observedAt: 81_000 }, 81_000)).toContain('attention=away')
  context.reset()
  expect(context.getContext(stable, 10_000)).toBeDefined()
})

it('omits stale, future, weak and unstable evidence', () => {
  const context = new CameraContextProvider()
  expect(context.getContext(stable, 12_001)).toBeUndefined()
  expect(context.getContext(stable, 9000)).toBeUndefined()
  expect(context.getContext({ ...stable, confidence: 0.4 }, 10_000)).toBeUndefined()
  expect(context.getContext({ ...stable, stableForMs: 80 }, 10_000)).toBeUndefined()
  expect(context.getContext({ ...stable, observedAt: 0 }, 10_000)).toBeUndefined()
})
