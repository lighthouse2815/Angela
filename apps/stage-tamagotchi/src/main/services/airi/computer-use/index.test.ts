import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import process from 'node:process'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import cliPackage from '@auv-js/cli/package.json' with { type: 'json' }

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
  getAppPath: vi.fn(),
}))

vi.mock('electron', () => ({ app: appMock }))
vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return { ...original, startAuv: vi.fn() }
})

let directory: string
let localExecutable: string

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('AUV_BINARY_PATH', '')
  appMock.isPackaged = true
  directory = await mkdtemp(join(tmpdir(), 'angela-auv-selection-'))
  localExecutable = join(directory, '.cache', 'auv', cliPackage.version, 'bin', process.platform === 'win32' ? 'auv.exe' : 'auv')
  appMock.getAppPath.mockReturnValue(join(directory, 'apps', 'stage-tamagotchi'))
  appMock.getPath.mockReturnValue(join(tmpdir(), 'angela-test-profile'))
  vi.mocked(startAuv).mockRejectedValue(new AuvDaemonStartError(
    'AUV daemon exited before becoming healthy (code 127, signal null)',
    'auv: error while loading shared libraries: liblept.so.5: cannot open shared object file',
  ))
})

afterEach(async () => {
  await emitAppBeforeQuit()
  await rm(directory, { recursive: true, force: true })
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

  it('uses the source-built CLI for development on the current system', async () => {
    appMock.isPackaged = false
    await mkdir(dirname(localExecutable), { recursive: true })
    await writeFile(localExecutable, '')
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: localExecutable }))
  })

  it('uses the bundled CLI before a local build exists', async () => {
    appMock.isPackaged = false
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: binaryPath() }))
  })

  it('does not select a local build from another SDK version', async () => {
    appMock.isPackaged = false
    const staleExecutable = join(directory, '.cache', 'auv', '0.0.0', 'bin', 'auv')
    await mkdir(dirname(staleExecutable), { recursive: true })
    await writeFile(staleExecutable, '')
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: binaryPath() }))
  })

  it('keeps an explicit executable ahead of a local development build', async () => {
    appMock.isPackaged = false
    await mkdir(dirname(localExecutable), { recursive: true })
    await writeFile(localExecutable, '')
    const executable = join(directory, 'custom-auv')
    vi.stubEnv('AUV_BINARY_PATH', executable)
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: executable }))
  })

  it('does not select a development build in a packaged application', async () => {
    await mkdir(dirname(localExecutable), { recursive: true })
    await writeFile(localExecutable, '')
    await expect(invokeComputerUse()({ argv: ['invoke', '--help'] })).rejects.toThrow()
    expect(startAuv).toHaveBeenCalledWith(expect.objectContaining({ binaryPath: binaryPath() }))
  })
})
