import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createContext, defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { studyWorkspaceDirectory, studyWorkspaceList, studyWorkspaceRead, studyWorkspaceSaveNote } from '../../../../shared/eventa/study-workspace'
import { setupStudyWorkspace } from './index'

const electron = vi.hoisted(() => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  owner: { isDestroyed: vi.fn(() => false) },
}))
vi.mock('electron', () => electron)

let directory: string

beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'angela-study-ipc-'))
  electron.owner.isDestroyed.mockReturnValue(false)
  electron.BrowserWindow.fromWebContents.mockReturnValue(electron.owner)
  electron.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [directory] })
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function clients() {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  setupStudyWorkspace(context)
  return {
    directory: defineInvoke(context, studyWorkspaceDirectory),
    list: defineInvoke(context, studyWorkspaceList),
    read: defineInvoke(context, studyWorkspaceRead),
    saveNote: defineInvoke(context, studyWorkspaceSaveNote),
  }
}

function choose(client: ReturnType<typeof clients>) {
  // The Electron adapter attaches the trusted IPC sender outside the request payload.
  return Reflect.apply(client.directory, undefined, [{ action: 'choose' }, { raw: { ipcMainEvent: { sender: { id: 42 } } } }]) as ReturnType<typeof client.directory>
}

describe('study workspace IPC', () => {
  it('reads a real lesson and saves a note through the public IPC contracts', async () => {
    const client = clients()
    await writeFile(join(directory, 'python.md'), '# Vòng lặp\nfor item in items:')
    expect((await client.directory({ action: 'status' })).directory).toBeNull()
    expect((await choose(client)).directory).toBe(await realpath(directory))
    expect(electron.dialog.showOpenDialog).toHaveBeenCalledWith(electron.owner, { properties: ['openDirectory'] })
    expect((await client.list({ path: '.' })).entries).toEqual([{ name: 'python.md', kind: 'document' }])
    expect(await client.read({ path: 'python.md' })).toMatchObject({ text: expect.stringContaining('for item in items:') })
    const result = await client.saveNote({ filename: 'ôn-python.md', content: '# Ôn tập\nNguồn: python.md' })
    expect(await readFile(join(directory, result.path), 'utf8')).toBe('# Ôn tập\nNguồn: python.md')
    await client.directory({ action: 'clear' })
    await expect(client.read({ path: 'python.md' })).rejects.toThrow('Choose a learning directory')
  })

  it('keeps the prior selection when the native picker is cancelled', async () => {
    const client = clients()
    await choose(client)
    electron.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await choose(client)).toEqual({ directory: await realpath(directory), cancelled: true })
  })

  it('requires a live invoking window before showing the picker', async () => {
    const client = clients()
    await expect(client.directory({ action: 'choose' })).rejects.toThrow('window is no longer available')
    expect(electron.dialog.showOpenDialog).not.toHaveBeenCalled()
  })

  it('rejects malformed IPC inputs at the host boundary', async () => {
    const client = clients()
    await choose(client)
    await expect(Reflect.apply(client.read, undefined, [{ path: 42 }])).rejects.toThrow()
    await expect(Reflect.apply(client.directory, undefined, [{ action: 'grant', directory }])).rejects.toThrow()
  })

  it('discards a pending choice after access is cleared', async () => {
    const client = clients()
    let finish: ((value: { canceled: boolean, filePaths: string[] }) => void) | undefined
    electron.dialog.showOpenDialog.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = choose(client)
    const rejection = expect(pending).rejects.toThrow('selection expired')
    await vi.waitFor(() => expect(finish).toBeDefined())
    await expect(choose(client)).rejects.toThrow('picker is already open')
    await client.directory({ action: 'clear' })
    finish?.({ canceled: false, filePaths: [directory] })
    await rejection
    expect((await client.directory({ action: 'status' })).directory).toBeNull()
  })
})
