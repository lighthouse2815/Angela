import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { AuvDaemonStartError, startAuv } from '@auv-js/sdk/node'
import { createContext, defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computerUseRun } from '../../../../shared/eventa/computer-use'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { setupComputerUse } from './index'

const appMock = vi.hoisted(() => ({
  isPackaged: true,
  getPath: vi.fn(),
}))

vi.mock('electron', () => ({ app: appMock }))
vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return { ...original, startAuv: vi.fn() }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('AUV_BINARY_PATH', '')
  appMock.getPath.mockReturnValue(join(tmpdir(), 'angela-test-profile'))
  vi.mocked(startAuv).mockRejectedValue(new AuvDaemonStartError(
    'AUV daemon exited before becoming healthy (code 127, signal null)',
    'auv: error while loading shared libraries: liblept.so.5: cannot open shared object file',
  ))
})

afterEach(async () => {
  await emitAppBeforeQuit()
  vi.unstubAllEnvs()
})

function invokeComputerUse() {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  setupComputerUse(context)
  return defineInvoke(context, computerUseRun)
}

describe('computer use executable selection and startup errors', () => {
  it('returns the native startup diagnostic through IPC', async () => {
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow('liblept.so.5')
  })

  it('uses the bundled executable when no custom executable is configured', async () => {
    vi.stubEnv('AUV_BINARY_PATH', '   ')
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: binaryPath() }))
  })

  it('uses an explicit executable unchanged in packaged applications', async () => {
    const executable = join(tmpdir(), 'app.asar', 'custom-auv')
    vi.stubEnv('AUV_BINARY_PATH', ` ${executable} `)
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: executable }))
  })

  it('rejects a relative executable path before starting a daemon', async () => {
    vi.stubEnv('AUV_BINARY_PATH', 'custom-auv')
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow('absolute path')
    expect(startAuv).not.toHaveBeenCalled()
  })
})
