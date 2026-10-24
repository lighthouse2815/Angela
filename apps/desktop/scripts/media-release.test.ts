import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, it } from 'vitest'

import { downloadMediaAsset, matchesMediaRecipe, mediaDigest } from './media-release'

let directory: string
let body = 'Pinned release bytes'
let calls = 0
const server = createServer((_request, response) => {
  calls++
  response.end(body)
})
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-pinned-download-'))
  body = 'Pinned release bytes'
  calls = 0
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await rm(directory, { recursive: true, force: true })
})
function asset() {
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Fixture server has no address')
  return { url: `http://127.0.0.1:${address.port}/artifact`, sha256: createHash('sha256').update('Pinned release bytes').digest('hex') }
}

it('verifies downloaded bytes and reuses a valid cache without another HTTP request', async () => {
  const input = asset()
  const path = await downloadMediaAsset(input, directory)
  expect(await mediaDigest(path)).toBe(input.sha256)
  expect(await readFile(path, 'utf8')).toBe(body)
  body = 'Changed upstream release'
  expect(await downloadMediaAsset(input, directory)).toBe(path)
  expect(calls).toBe(1)
})

it('rejects changed upstream bytes and leaves no partial artifact', async () => {
  body = 'Changed upstream release'
  await expect(downloadMediaAsset(asset(), directory)).rejects.toThrow('checksum mismatch')
  expect(await readdir(directory)).toEqual([])
})

it('bounds the download even when the body arrives without a trusted length', async () => {
  await expect(downloadMediaAsset(asset(), directory, 5)).rejects.toThrow('size budget')
  expect(await readdir(directory)).toEqual([])
})

it('repairs corrupt cached bytes only after verification of a new download', async () => {
  const input = asset()
  await writeFile(join(directory, input.sha256), 'Corrupt cache')
  expect(await mediaDigest(await downloadMediaAsset(input, directory))).toBe(input.sha256)
  expect(calls).toBe(1)
})

it('reuses a staged build only for the exact recipe and handles missing or corrupt receipts', async () => {
  const stage = join(directory, 'release')
  expect(await matchesMediaRecipe(stage, 'recipe-a')).toBe(false)
  await mkdir(stage)
  await writeFile(join(stage, 'recipe.json'), '{invalid')
  expect(await matchesMediaRecipe(stage, 'recipe-a')).toBe(false)
  await writeFile(join(stage, 'recipe.json'), JSON.stringify({ sha256: 'recipe-a' }))
  expect(await matchesMediaRecipe(stage, 'recipe-a')).toBe(true)
  expect(await matchesMediaRecipe(stage, 'recipe-b')).toBe(false)
})
