import { createHash } from 'node:crypto'
import { access, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalModelManager } from './models'

let directory: string
let models: LocalModelManager
let source: string
const bytes = new Uint8Array(2 * 1024 * 1024).fill(42)
bytes.set([0x6C, 0x6D, 0x67, 0x67])
const checksum = createHash('sha256').update(bytes).digest('hex')
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-model-import-'))
  source = join(directory, 'selected.bin')
  await writeFile(source, bytes)
  models = new LocalModelManager(join(directory, 'models'))
})
afterEach(async () => rm(directory, { recursive: true, force: true }))

describe('explicit verified local model installation', () => {
  it('reports missing setup without creating or downloading a model', async () => {
    expect(await models.status()).toMatchObject({ state: 'MISSING' })
    await expect(models.requireModel()).rejects.toThrow('Import a verified')
    await expect(access(join(directory, 'models'))).rejects.toThrow()
  })

  it('copies real files privately, verifies SHA-256, and survives restart', async () => {
    expect(models.startImport(source, checksum)).toMatchObject({ state: 'IMPORTING', progress: 0 })
    await expect(models.requireModel()).rejects.toThrow('Wait for')
    await models.whenIdle()
    expect(await models.status()).toMatchObject({ state: 'READY', progress: 1, sha256: checksum })
    const path = await new LocalModelManager(join(directory, 'models')).requireModel()
    expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(checksum)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await readdir(join(directory, 'models'))).some(name => name.endsWith('.partial'))).toBe(false)
    expect((await stat(source)).size).toBe(bytes.length)
  })

  it('preserves the installed model after a checksum mismatch', async () => {
    models.startImport(source, checksum)
    await models.whenIdle()
    models.startImport(source, '0'.repeat(64))
    await models.whenIdle()
    expect(await models.status()).toMatchObject({ state: 'ERROR', error: expect.stringContaining('checksum does not match') })
    expect(await models.requireModel()).toBe(join(directory, 'models', `${checksum}.bin`))
    expect((await readdir(join(directory, 'models'))).filter(name => name.endsWith('.bin'))).toEqual([`${checksum}.bin`])
  })

  it('supports cancellation, cleans staging files, and never publishes incomplete bytes', async () => {
    models.startImport(source, checksum)
    await models.cancel()
    expect(await models.status()).toMatchObject({ state: 'ERROR', error: expect.stringContaining('cancelled') })
    await expect(models.requireModel()).rejects.toThrow('Import a verified')
    expect((await readdir(join(directory, 'models'))).some(name => /\.(?:bin|partial)$/u.test(name))).toBe(false)
  })

  it('rechecks a changed model and rejects corruption', async () => {
    models.startImport(source, checksum)
    await models.whenIdle()
    const path = await models.requireModel()
    await writeFile(path, 'corrupted-model')
    await expect(models.requireModel()).rejects.toThrow('checksum verification')
  })

  it('bounds disk use to one verified model plus one staging copy during replacement', async () => {
    models.startImport(source, checksum)
    await models.whenIdle()
    const updated = new Uint8Array(1024).fill(7)
    updated.set([0x6C, 0x6D, 0x67, 0x67])
    const nextChecksum = createHash('sha256').update(updated).digest('hex')
    await writeFile(source, updated)
    models.startImport(source, nextChecksum)
    await models.whenIdle()
    expect((await readdir(join(directory, 'models'))).filter(name => name.endsWith('.bin'))).toEqual([`${nextChecksum}.bin`])
    expect(await models.requireModel()).toContain(nextChecksum)
  })

  it('rejects non-model files even when their checksum matches', async () => {
    await writeFile(source, 'not-a-whisper-model')
    models.startImport(source, createHash('sha256').update('not-a-whisper-model').digest('hex'))
    await models.whenIdle()
    expect(await models.status()).toMatchObject({ state: 'ERROR', error: expect.stringContaining('not a whisper.cpp GGML model') })
    await expect(models.requireModel()).rejects.toThrow('Import a verified')
  })

  it('rejects invalid checksums before touching files', () => {
    expect(() => models.startImport(source, 'not-a-checksum')).toThrow('trusted SHA-256')
  })
})
