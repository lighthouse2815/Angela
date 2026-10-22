import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { createComputerUseRuntime } from './runtime'

const native = vi.hoisted(() => ({ execute: vi.fn(), start: vi.fn(), stop: vi.fn() }))
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util')
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: native.execute }) }
})
vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return { ...original, startAuv: native.start }
})

let directory: string
let runtime: ReturnType<typeof createComputerUseRuntime>
let focused: number | null
const entries = [
  { id: 42, title: 'Target document', app_id: 'code', is_focused: false, pid: 900 },
  { id: 43, title: 'Other document', app_id: 'code', is_focused: true, pid: 901 },
]
const clipboard = {
  availableFormats: vi.fn(() => ['text/plain']),
  readText: vi.fn(() => 'previous'),
  writeText: vi.fn(),
  clear: vi.fn(),
}

beforeEach(async () => {
  vi.clearAllMocks()
  focused = 43
  directory = await mkdtemp(join(tmpdir(), 'angela-windows-'))
  native.start.mockResolvedValue({ connectionOptions: { endpoint: 'unix:///unused' }, exited: new Promise(() => {}), stop: native.stop })
  native.execute.mockImplementation(async (binary: string, args: string[]) => {
    let output: unknown = {}
    if (binary === 'niri') {
      if (args[2] === 'windows')
        output = entries
      if (args[2] === 'focused-window')
        output = focused === null ? null : { ...entries.find(entry => entry.id === focused), is_focused: true }
      if (args[2] === 'action') {
        focused = Number(args[5])
        return { stdout: '', stderr: '' }
      }
    }
    return { stdout: JSON.stringify(output), stderr: '' }
  })
  runtime = createComputerUseRuntime({ binaryPath: 'unused-auv', storeRoot: directory, windowBackend: 'niri', clipboard })
})

afterEach(async () => {
  await runtime.dispose()
  await rm(directory, { recursive: true, force: true })
})

it('filters window titles and returns only the public compositor fields without starting AUV', async () => {
  expect(await runtime.windows({ action: 'list', title: 'Target' })).toEqual({
    backend: 'niri',
    windows: [{ id: 42, title: 'Target document', appId: 'code', focused: false }],
  })
  expect(native.start).not.toHaveBeenCalled()
})

it('focuses an exact discovered ID and verifies it through the compositor', async () => {
  const result = await runtime.windows({ action: 'focus', id: 42 })
  expect(native.execute.mock.calls.map(call => call[1])).toEqual([
    ['msg', '--json', 'windows'],
    ['msg', '--json', 'action', 'focus-window', '--id', '42'],
    ['msg', '--json', 'focused-window'],
  ])
  expect(result.windows[0]?.focused).toBe(true)
})

it('rejects missing windows without a focus action', async () => {
  await expect(runtime.windows({ action: 'focus', id: 999 })).rejects.toThrow('does not exist')
  expect(native.execute).toHaveBeenCalledTimes(1)
})

it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '42; exit'])('rejects invalid native IDs %s before executing a command', async (id) => {
  await expect(runtime.windows({ action: 'focus', id })).rejects.toThrow()
  expect(native.execute).not.toHaveBeenCalled()
})

it('rejects input after focus changes during daemon startup', async () => {
  focused = 42
  native.start.mockImplementationOnce(async () => {
    focused = 43
    return { connectionOptions: { endpoint: 'unix:///unused' }, exited: new Promise(() => {}), stop: native.stop }
  })
  await expect(runtime.run({ argv: ['invoke', 'input.key', 'ctrl+a'], windowId: 42 })).rejects.toThrow('no longer focused')
  expect(native.execute.mock.calls.every(call => call[0] === 'niri')).toBe(true)
})

it('rejects a paste into a different window before changing the clipboard', async () => {
  await expect(runtime.pasteText({ text: 'Xin chào', windowId: 42 })).rejects.toThrow('no longer focused')
  expect(clipboard.writeText).not.toHaveBeenCalled()
  expect(native.start).not.toHaveBeenCalled()
})

it('rejects input when no window is focused', async () => {
  focused = null
  await expect(runtime.run({ argv: ['invoke', 'input.key', 'ctrl+s'], windowId: 42 })).rejects.toThrow('no longer focused')
  expect(native.execute.mock.calls.every(call => call[0] === 'niri')).toBe(true)
})

it('rejects unsupported desktops instead of guessing a backend', async () => {
  await runtime.dispose()
  runtime = createComputerUseRuntime({ binaryPath: 'unused-auv', storeRoot: directory })
  await expect(runtime.windows({ action: 'list' })).rejects.toThrow('requires Linux Niri')
  expect(native.execute).not.toHaveBeenCalled()
})

it('preserves compositor errors without claiming a successful focus', async () => {
  native.execute.mockRejectedValueOnce(new Error('Niri disconnected'))
  await expect(runtime.windows({ action: 'focus', id: 42 })).rejects.toThrow('Niri disconnected')
})

it('validates compositor responses before focusing', async () => {
  native.execute.mockResolvedValueOnce({ stdout: '[{"id":42}]', stderr: '' })
  await expect(runtime.windows({ action: 'focus', id: 42 })).rejects.toThrow()
  expect(native.execute).toHaveBeenCalledTimes(1)
})

it('rejects a guarded input that can activate a different AUV target', async () => {
  await expect(runtime.run({ argv: ['invoke', 'input.key', 'ctrl+a', '--target', 'window:99'], windowId: 42 })).rejects.toThrow('Do not combine')
  expect(native.start).not.toHaveBeenCalled()
  expect(native.execute).not.toHaveBeenCalled()
})

it('allows guarded input after selecting the correct window', async () => {
  await runtime.windows({ action: 'focus', id: 42 })
  const result = await runtime.run({ argv: ['invoke', 'input.key', 'ctrl+a'], windowId: 42 })
  expect(result.exitCode).toBe(0)
  expect(native.execute.mock.calls.at(-1)?.[0]).toBe('unused-auv')
})

it('rejects discovery after runtime disposal', async () => {
  await runtime.dispose()
  await expect(runtime.windows({ action: 'list' })).rejects.toThrow('stopped')
  expect(native.execute).not.toHaveBeenCalled()
})

it('accepts a null windowId from a strict provider schema as unguarded foreground input', async () => {
  const result = await runtime.run({ argv: ['invoke', 'input.key', 'ctrl+a'], windowId: null })
  expect(result.exitCode).toBe(0)
  expect(native.execute.mock.calls.every(call => call[0] === 'unused-auv')).toBe(true)
})

it('accepts a null title filter from a strict provider schema', async () => {
  const result = await runtime.windows({ action: 'list', title: null })
  expect(result.windows).toHaveLength(2)
})
