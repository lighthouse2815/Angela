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
let text: string
const clipboard = {
  availableFormats: vi.fn(() => ['text/plain']),
  readText: vi.fn(() => text),
  writeText: vi.fn((value: string) => { text = value }),
  clear: vi.fn(() => { text = '' }),
}

beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'angela-paste-test-'))
  text = 'previous clipboard'
  clipboard.availableFormats.mockReturnValue(['text/plain'])
  native.start.mockResolvedValue({
    connectionOptions: { endpoint: 'unix:///unused-test-socket' },
    exited: new Promise(() => {}),
    stop: native.stop,
  })
  native.execute.mockResolvedValue({ stdout: '{"verified":false}', stderr: '' })
  runtime = createComputerUseRuntime({ binaryPath: 'unused-auv', storeRoot: directory, clipboard })
})

afterEach(async () => {
  await runtime.dispose()
  await rm(directory, { recursive: true, force: true })
})

it('delivers Vietnamese through Ctrl+V and restores the previous text without claiming verification', async () => {
  native.execute.mockImplementationOnce(async (_binary, argv) => {
    expect(argv.slice(0, 3)).toEqual(['invoke', 'input.key', 'ctrl+v'])
    expect(text).toBe('Xin chào, mình là Angela!')
    return { stdout: '{"verified":false}', stderr: '' }
  })
  const result = await runtime.pasteText({ text: 'Xin chào, mình là Angela!' })
  expect(result.exitCode).toBe(0)
  expect(result.output).toEqual({ keyboard: { verified: false }, clipboardRestored: true, verified: false })
  expect(text).toBe('previous clipboard')
})

it.each([['image/png'], ['text/plain', 'text/html']])('preserves non-text clipboard formats %j before any native input', async (...formats) => {
  clipboard.availableFormats.mockReturnValue(formats)
  await expect(runtime.pasteText({ text: 'Tiếng Việt' })).rejects.toThrow('non-text data')
  expect(clipboard.writeText).not.toHaveBeenCalled()
  expect(native.start).not.toHaveBeenCalled()
})

it.each(['', 'a'.repeat(16385), 'abc\0def'])('rejects invalid text before touching the clipboard', async (invalid) => {
  await expect(runtime.pasteText({ text: invalid })).rejects.toThrow()
  expect(clipboard.availableFormats).not.toHaveBeenCalled()
})

it('clears a previously empty clipboard after delivery', async () => {
  clipboard.availableFormats.mockReturnValue([])
  text = ''
  await runtime.pasteText({ text: 'Tiếng Việt' })
  expect(clipboard.clear).toHaveBeenCalledOnce()
  expect(text).toBe('')
})

it('preserves a new user copy during delivery', async () => {
  native.execute.mockImplementationOnce(async () => {
    text = 'new user copy'
    return { stdout: '{}', stderr: '' }
  })
  const result = await runtime.pasteText({ text: 'Tiếng Việt' })
  expect(result.output).toEqual({ keyboard: {}, clipboardRestored: false, verified: false })
  expect(text).toBe('new user copy')
  expect(clipboard.writeText).toHaveBeenCalledTimes(1)
})

it('preserves new rich clipboard data even when its plain text matches the pasted text', async () => {
  native.execute.mockImplementationOnce(async () => {
    clipboard.availableFormats.mockReturnValue(['text/plain', 'text/html'])
    return { stdout: '{}', stderr: '' }
  })
  const result = await runtime.pasteText({ text: 'Tiếng Việt' })
  expect(result.output).toEqual({ keyboard: {}, clipboardRestored: false, verified: false })
  expect(clipboard.writeText).toHaveBeenCalledTimes(1)
})

it('restores the clipboard when the daemon cannot start and permits a later retry', async () => {
  native.start.mockRejectedValueOnce(new Error('permission denied'))
  await expect(runtime.pasteText({ text: 'Tiếng Việt' })).rejects.toThrow('permission denied')
  expect(text).toBe('previous clipboard')
  expect((await runtime.pasteText({ text: 'Thử lại' })).exitCode).toBe(0)
})

it('retains native failure details and restores the clipboard', async () => {
  native.execute.mockRejectedValueOnce(Object.assign(new Error('key failed'), { code: 1, stdout: '{"failure":"denied"}', stderr: 'permission denied' }))
  const result = await runtime.pasteText({ text: 'Tiếng Việt' })
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toBe('permission denied')
  expect(result.output).toEqual({ keyboard: { failure: 'denied' }, clipboardRestored: true, verified: false })
  expect(text).toBe('previous clipboard')
})

it('serializes a paste with other desktop operations', async () => {
  let release: () => void = () => {}
  native.execute.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return { stdout: '{}', stderr: '' }
  })
  const pasting = runtime.pasteText({ text: 'Tiếng Việt' })
  await vi.waitFor(() => expect(native.execute).toHaveBeenCalledTimes(1))
  const next = runtime.run({ argv: ['invoke', '--help'] })
  expect(native.execute).toHaveBeenCalledTimes(1)
  release()
  await pasting
  await next
  expect(native.execute).toHaveBeenCalledTimes(2)
  expect(text).toBe('previous clipboard')
})

it('restores clipboard during shutdown and rejects later pastes', async () => {
  const pasting = runtime.pasteText({ text: 'Tiếng Việt' })
  const rejected = expect(pasting).rejects.toThrow()
  await vi.waitFor(() => expect(native.execute).toHaveBeenCalledOnce())
  await runtime.dispose()
  await rejected
  expect(text).toBe('previous clipboard')
  await expect(runtime.pasteText({ text: 'Thử lại' })).rejects.toThrow('stopped')
})

it('uses native AUV paste on backends without the Electron clipboard adapter', async () => {
  await runtime.dispose()
  runtime = createComputerUseRuntime({ binaryPath: 'unused-auv', storeRoot: directory })
  await runtime.pasteText({ text: 'Tiếng Việt' })
  expect(native.execute.mock.calls[0]?.[1].slice(0, 3)).toEqual(['invoke', 'input.pasteText', 'Tiếng Việt'])
  expect(clipboard.writeText).not.toHaveBeenCalled()
})
