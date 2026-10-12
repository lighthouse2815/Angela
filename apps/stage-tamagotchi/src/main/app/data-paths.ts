import type { App } from 'electron'

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Keeps existing profiles independent of the user-facing product name. */
export function configureDataPaths(app: Pick<App, 'isPackaged' | 'getPath' | 'setPath'>, override?: string): void {
  const explicitPath = override?.trim()
  const profile = explicitPath
    ? resolve(explicitPath)
    : join(app.getPath('appData'), app.isPackaged ? 'AIRI' : '@proj-airi/stage-tamagotchi')

  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
  app.setPath('sessionData', profile)
}
