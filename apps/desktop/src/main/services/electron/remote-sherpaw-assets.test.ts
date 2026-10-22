import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createContext, defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { electronModelAssetEnsure, electronModelAssetRemove, electronModelAssetsList } from '../../../shared/eventa/model-assets'
import { setupSherpawModelAssets } from './sherpaw-model-assets'

const electron = vi.hoisted(() => ({
  getPath: vi.fn(),
  handle: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: electron.getPath },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {},
  protocol: { handle: electron.handle },
  net: { fetch: electron.fetch },
}))

const id = 'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20'
const revision = '1770a4b22db32184c110ac43c601db17cc9c93f8'
let directory: string

beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'angela-remote-models-'))
  electron.getPath.mockReturnValue(directory)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

function modelClient() {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  setupSherpawModelAssets(context)
  return {
    list: defineInvoke(context, electronModelAssetsList),
    ensure: defineInvoke(context, electronModelAssetEnsure),
    remove: defineInvoke(context, electronModelAssetRemove),
  }
}

it('lists the remote wake word pack without downloading it at startup', async () => {
  const download = vi.spyOn(globalThis, 'fetch')
  const client = modelClient()

  expect(await client.list()).toContainEqual(expect.objectContaining({ id, state: 'missing' }))
  expect(download).not.toHaveBeenCalled()
})

it('installs the pinned pair on request and removes it through the model asset API', async () => {
  const download = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/preload.data'))
      return new Response(new Uint8Array([1, 2, 3]))
    if (url.endsWith('/preload.js.metadata'))
      return Response.json({ remote_package_size: 3, files: [] })
    throw new Error(`Unexpected download: ${url}`)
  })
  const client = modelClient()

  await client.ensure(id)

  expect(download).toHaveBeenCalledTimes(2)
  expect(download.mock.calls[0][0]).toContain(`/${revision}/install/bin/wasm/preload.data`)
  expect(download.mock.calls[1][0]).toContain(`/${revision}/install/bin/wasm/preload.js.metadata`)
  const installed = join(directory, 'model-assets', id, revision)
  expect(new Uint8Array(await readFile(join(installed, 'data')))).toEqual(new Uint8Array([1, 2, 3]))
  expect(await client.list()).toContainEqual(expect.objectContaining({ id, state: 'installed' }))

  electron.fetch.mockImplementation(async (input: string) => new Response(await readFile(fileURLToPath(input))))
  const handler = electron.handle.mock.calls[0][1] as (request: Request) => Promise<Response>
  const response = await handler(new Request(`airi-model://assets/${id}/${revision}/data`))
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  const stale = await handler(new Request(`airi-model://assets/${id}/wrong-revision/data`))
  expect(stale.status).toBe(404)

  await client.remove(id)

  expect(await client.list()).toContainEqual(expect.objectContaining({ id, state: 'missing' }))
  await expect(readFile(join(installed, 'data'))).rejects.toMatchObject({ code: 'ENOENT' })
})
