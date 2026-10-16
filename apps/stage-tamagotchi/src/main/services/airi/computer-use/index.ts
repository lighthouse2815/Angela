import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { env, platform } from 'node:process'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app, clipboard } from 'electron'
import { object, parse, string } from 'valibot'

import { computerUsePasteText, computerUseReadImage, computerUseRun, computerUseWindows } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createComputerUseRuntime } from './runtime'
import { WaylandClipboard } from './wayland-clipboard'

const cliPackage = parse(object({ version: string() }), createRequire(import.meta.url)('@auv-js/cli/package.json'))

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
        // Development builds use system libraries and stay isolated by SDK version.
        const localExecutable = app.isPackaged
          ? undefined
          : resolve(app.getAppPath(), '..', '..', '.cache', 'auv', cliPackage.version, 'bin', platform === 'win32' ? 'auv.exe' : 'auv')
        if (localExecutable && existsSync(localExecutable)) {
          executable = localExecutable
        }
        else {
          executable = binaryPath()
          // Native executables cannot run inside Electron's archive.
          if (app.isPackaged)
            executable = executable.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
        }
      }
      runtime = createComputerUseRuntime({
        binaryPath: executable,
        storeRoot: join(app.getPath('userData'), 'computer-use'),
        windowBackend: platform === 'linux' && env.NIRI_SOCKET ? 'niri' : undefined,
        clipboard: platform === 'linux' && env.AUV_LINUX_INPUT_BACKEND === 'uinput'
          ? env.NIRI_SOCKET ? new WaylandClipboard() : clipboard
          : undefined,
      })
    }
    return runtime
  }
  defineInvokeHandler(context, computerUseRun, input => getRuntime().run(input))
  defineInvokeHandler(context, computerUsePasteText, input => getRuntime().pasteText(input))
  defineInvokeHandler(context, computerUseWindows, input => getRuntime().windows(input))
  defineInvokeHandler(context, computerUseReadImage, input => getRuntime().readImage(input))
  onAppBeforeQuit(async () => {
    stopped = true
    await runtime?.dispose()
  })
}
