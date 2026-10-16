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

import { computerUsePasteText, computerUseRun } from '../../../../shared/eventa/computer-use'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { setupComputerUse } from './index'

const appMock = vi.hoisted(() => ({
  isPackaged: true,
  getPath: vi.fn(),
  getAppPath: vi.fn(),
}))

const clipboardMock = vi.hoisted(() => {
  let value = 'previous clipboard'
  return {
    availableFormats: vi.fn(() => ['text/plain']),
    readText: vi.fn(() => value),
    writeText: vi.fn((text: string) => { value = text }),
    clear: vi.fn(),
  }
})
vi.mock('electron', () => ({ app: appMock, clipboard: clipboardMock }))
vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return { ...original, startAuv: vi.fn() }
})

let directory: string
let localExecutable: string

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('NIRI_SOCKET', '')
  vi.stubEnv('AUV_BINARY_PATH', '')
  vi.stubEnv('AUV_LINUX_INPUT_BACKEND', '')
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

describe('computer use paste IPC', () => {
  it('validates text before starting the native backend', async () => {
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    setupComputerUse(context)
    await expect(defineInvoke(context, computerUsePasteText)({ text: '' })).rejects.toThrow()
    expect(startAuv).not.toHaveBeenCalled()
  })

  it.runIf(process.platform === 'linux')('selects Electron clipboard for uinput and restores it on startup failure', async () => {
    vi.stubEnv('AUV_LINUX_INPUT_BACKEND', 'uinput')
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    setupComputerUse(context)
    await expect(defineInvoke(context, computerUsePasteText)({ text: 'Xin chào Angela' })).rejects.toThrow('liblept.so.5')
    expect(clipboardMock.writeText).toHaveBeenNthCalledWith(1, 'Xin chào Angela')
    expect(clipboardMock.writeText).toHaveBeenNthCalledWith(2, 'previous clipboard')
  })

  it('rejects paste requests after application shutdown', async () => {
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    setupComputerUse(context)
    await emitAppBeforeQuit()
    await expect(defineInvoke(context, computerUsePasteText)({ text: 'Xin chào' })).rejects.toThrow('stopped')
    expect(startAuv).not.toHaveBeenCalled()
  })
})
