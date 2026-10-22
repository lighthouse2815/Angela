import { beforeEach, expect, it, vi } from 'vitest'

import { WaylandClipboard } from './wayland-clipboard'

const native = vi.hoisted(() => ({ execute: vi.fn(), stdin: vi.fn() }))
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util')
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: native.execute }) }
})

let clipboard: WaylandClipboard
beforeEach(() => {
  vi.clearAllMocks()
  clipboard = new WaylandClipboard()
  native.execute.mockImplementation(() => Object.assign(Promise.resolve({ stdout: '', stderr: '' }), { child: { stdin: { end: native.stdin } } }))
})

it('recognizes native text aliases and preserves rich MIME types for rejection', async () => {
  native.execute.mockResolvedValueOnce({ stdout: 'text/plain;charset=utf-8\nTEXT\nSTRING\nUTF8_STRING\ntext/html\nimage/png\n', stderr: '' })
  expect(await clipboard.availableFormats()).toEqual(['text/plain;charset=utf-8', 'text/plain', 'text/html', 'image/png'])
})

it('recognizes an empty selection without treating other native errors as empty', async () => {
  native.execute.mockRejectedValueOnce(Object.assign(new Error('empty'), { code: 1, stderr: 'Nothing is copied\n' }))
  expect(await clipboard.availableFormats()).toEqual([])
  native.execute.mockRejectedValueOnce(Object.assign(new Error('display disconnected'), { code: 1, stderr: 'Failed to connect' }))
  await expect(clipboard.availableFormats()).rejects.toThrow('display disconnected')
})

it('reads an empty clipboard without a failing paste request', async () => {
  native.execute.mockRejectedValueOnce(Object.assign(new Error('empty'), { code: 1, stderr: 'Nothing is copied' }))
  expect(await clipboard.readText()).toBe('')
  expect(native.execute).toHaveBeenCalledTimes(1)
})

it('reads exact text without a synthetic trailing newline', async () => {
  native.execute.mockResolvedValueOnce({ stdout: 'text/plain\n', stderr: '' })
  native.execute.mockResolvedValueOnce({ stdout: 'Tiếng Việt\n', stderr: '' })
  expect(await clipboard.readText()).toBe('Tiếng Việt\n')
  expect(native.execute.mock.calls[1]?.slice(0, 2)).toEqual(['wl-paste', ['--no-newline', '--type', 'text']])
})

it('writes literal text through stdin rather than process arguments', async () => {
  await clipboard.writeText('Tiếng Việt --help')
  expect(native.stdin).toHaveBeenCalledWith('Tiếng Việt --help')
  expect(native.execute.mock.calls[0]?.slice(0, 2)).toEqual(['wl-copy', ['--type', 'text/plain;charset=utf-8']])
  expect(native.execute.mock.calls[0]?.[2]).toMatchObject({ timeout: 5000, maxBuffer: 4 * 1024 * 1024 })
})

it('clears the native selection when restoring an originally empty clipboard', async () => {
  await clipboard.clear()
  expect(native.execute.mock.calls[0]?.slice(0, 2)).toEqual(['wl-copy', ['--clear']])
})

it('reports missing native utilities with an actionable dependency message', async () => {
  native.execute.mockRejectedValueOnce(Object.assign(new Error('spawn failed'), { code: 'ENOENT' }))
  await expect(clipboard.availableFormats()).rejects.toThrow('Install wl-clipboard')
})
