import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { isAbsolute, join, sep } from 'node:path'
import { env } from 'node:process'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createComputerUseRuntime } from './runtime'

/** Registers host-owned computer use. The executable is resolved only on the first call. */
export function setupComputerUse(context: ReturnType<typeof createContext>['context']) {
  let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
  let stopped = false
  function getRuntime() {
    if (stopped)
      throw new Error('Computer use has stopped.')
    if (!runtime) {
      let executable = env.AUV_BINARY_PATH?.trim()
      if (executable) {
        if (!isAbsolute(executable))
          throw new Error('AUV_BINARY_PATH must be an absolute path.')
      }
      else {
        executable = binaryPath()
        // Native executables cannot run inside Electron's archive.
        if (app.isPackaged)
          executable = executable.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
      }
      runtime = createComputerUseRuntime({
        binaryPath: executable,
        storeRoot: join(app.getPath('userData'), 'computer-use'),
      })
    }
    return runtime
  }
  defineInvokeHandler(context, computerUseRun, input => getRuntime().run(input))
  defineInvokeHandler(context, computerUseReadImage, input => getRuntime().readImage(input))
  onAppBeforeQuit(async () => {
    stopped = true
    await runtime?.dispose()
  })
}
