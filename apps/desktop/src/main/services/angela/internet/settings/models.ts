import type { LocalModelStatus } from '../../../../../shared/study-along'

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { InternetError } from '@angela/companion/internet'
import { MemoryFile } from '@angela/companion/memory-file'

import * as v from 'valibot'

const sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u))
const modelSchema = v.object({ sha256: v.nullable(sha256Schema) })
const maxModelBytes = 2 * 1024 * 1024 * 1024

/** Imports an explicitly selected model. No network access, hidden downloads, or unverified external paths enter inference. */
export class LocalModelManager {
  private readonly file: MemoryFile<v.InferOutput<typeof modelSchema>>
  private pending?: Promise<void>
  private abort?: AbortController
  private current: LocalModelStatus = { state: 'MISSING', progress: 0, sha256: null, error: null }
  private verified?: { sha256: string, size: number, modified: number }

  constructor(private readonly directory: string) {
    this.file = new MemoryFile(directory, 'local-model', modelSchema, () => ({ sha256: null }), { invalid: 'Invalid local model configuration.', locked: 'Local model configuration is busy.' })
  }

  private path(sha256: string) { return join(this.directory, `${sha256}.bin`) }

  async status(): Promise<LocalModelStatus> {
    if (this.pending || this.current.state === 'ERROR')
      return { ...this.current }
    const model = await this.file.read()
    if (model.sha256) {
      try {
        const info = await lstat(this.path(model.sha256))
        if (info.isFile() && info.size > 4 && info.size <= maxModelBytes)
          return { state: 'READY', progress: 1, sha256: model.sha256, error: null }
      }
      catch {
        // A removed model requires explicit setup. Never substitute a model from the working directory.
      }
    }
    return { state: 'MISSING', progress: 0, sha256: null, error: null }
  }

  /** Requires verified app-owned bytes. Rechecks the hash after a restart or a file change. */
  async requireModel(signal?: AbortSignal) {
    if (this.pending)
      throw new InternetError('NEED_SETUP', 'Wait for the local model import to finish.')
    const model = await this.file.read()
    if (!model.sha256)
      throw new InternetError('NEED_SETUP', 'Import a verified whisper.cpp model in Study Along settings.')
    const path = this.path(model.sha256)
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.size <= 4 || info.size > maxModelBytes)
        throw new Error('Invalid model file')
      if (this.verified?.sha256 !== model.sha256 || this.verified.size !== info.size || this.verified.modified !== info.mtimeMs) {
        const actual = await this.hashFile(path, signal)
        if (actual !== model.sha256)
          throw new Error('Model checksum changed')
        this.verified = { sha256: model.sha256, size: info.size, modified: info.mtimeMs }
      }
      return path
    }
    catch {
      if (signal?.aborted)
        throw new InternetError('CANCELLED', 'Local model verification was cancelled.')
      const message = 'The local model is missing or failed checksum verification. Import it again.'
      this.current = { state: 'ERROR', progress: 0, sha256: model.sha256, error: message }
      throw new InternetError('NEED_SETUP', message)
    }
  }

  private async hashFile(path: string, signal?: AbortSignal) {
    const source = await open(path, 'r')
    try {
      const hash = createHash('sha256')
      const buffer = new Uint8Array(1024 * 1024)
      let count = 0
      while (true) {
        signal?.throwIfAborted()
        const { bytesRead } = await source.read(buffer)
        if (!bytesRead)
          break
        count += bytesRead
        if (count > maxModelBytes)
          throw new InternetError('LIMIT_EXCEEDED', 'The local model exceeds 2 GiB.')
        hash.update(buffer.subarray(0, bytesRead))
      }
      return hash.digest('hex')
    }
    finally { await source.close() }
  }

  /** Only the native file picker supplies sourcePath. The trusted checksum comes from the model publisher or release pipeline. */
  startImport(sourcePath: string, checksum: string): LocalModelStatus {
    if (this.pending)
      throw new InternetError('UNAVAILABLE', 'A local model import is already running.')
    const parsed = v.safeParse(sha256Schema, checksum.trim().toLowerCase())
    if (!parsed.success)
      throw new InternetError('NEED_SETUP', 'Enter the trusted SHA-256 checksum before importing a model.')
    this.abort = new AbortController()
    this.current = { state: 'IMPORTING', progress: 0, sha256: parsed.output, error: null }
    this.pending = this.copy(sourcePath, parsed.output, this.abort.signal).catch((error: unknown) => {
      this.current = { ...this.current, state: 'ERROR', error: error instanceof InternetError ? error.message : 'The model import failed. Check disk space, file permissions, and the trusted SHA-256 checksum.' }
    }).finally(() => {
      this.pending = undefined
    })
    return { ...this.current }
  }

  private async copy(sourcePath: string, sha256: string, signal: AbortSignal) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const previous = await this.file.read()
    // An explicit import reclaims app-owned artifacts left by interruption. The selected model remains available on failure.
    for (const name of await readdir(this.directory)) {
      if (/^[\da-f-]+\.partial$/u.test(name) || (/^[a-f0-9]{64}\.bin$/u.test(name) && name !== `${previous.sha256}.bin`))
        await rm(join(this.directory, name), { force: true })
    }
    const temporary = join(this.directory, `${randomUUID()}.partial`)
    let installed = false
    let published = false
    try {
      const info = await lstat(sourcePath)
      if (!info.isFile() || info.size <= 4 || info.size > maxModelBytes)
        throw new InternetError('LIMIT_EXCEEDED', 'Choose a regular whisper.cpp model file smaller than 2 GiB.')
      const target = await open(temporary, 'wx', 0o600)
      let source: Awaited<ReturnType<typeof open>> | undefined
      try {
        source = await open(sourcePath, 'r')
        const hash = createHash('sha256')
        const buffer = new Uint8Array(1024 * 1024)
        let count = 0
        while (true) {
          signal.throwIfAborted()
          const { bytesRead } = await source.read(buffer)
          if (!bytesRead)
            break
          count += bytesRead
          if (count > maxModelBytes)
            throw new InternetError('LIMIT_EXCEEDED', 'The local model exceeds 2 GiB.')
          const data = buffer.subarray(0, bytesRead)
          // whisper.cpp GGML models start with the little-endian magic defined by ggml/include/ggml.h.
          if (count === bytesRead && (bytesRead < 4 || new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) !== 0x67676D6C))
            throw new InternetError('NEED_SETUP', 'The selected file is not a whisper.cpp GGML model.')
          hash.update(data)
          let offset = 0
          while (offset < data.length)
            offset += (await target.write(data.subarray(offset))).bytesWritten
          this.current.progress = Math.min(0.99, count / info.size)
        }
        if (hash.digest('hex') !== sha256)
          throw new InternetError('NEED_SETUP', 'The model SHA-256 checksum does not match. The previous model was preserved.')
        await target.sync()
      }
      finally {
        await source?.close()
        await target.close()
      }
      signal.throwIfAborted()
      await rename(temporary, this.path(sha256))
      installed = true
      await this.file.edit((state) => {
        signal.throwIfAborted()
        state.sha256 = sha256
      })
      published = true
      this.verified = undefined
      this.current = { state: 'READY', progress: 1, sha256, error: null }
      // The host waits for active inference before import. Keep one model and at most one bounded staging copy.
      for (const name of await readdir(this.directory)) {
        if (/^[a-f0-9]{64}\.bin$/u.test(name) && name !== `${sha256}.bin`)
          await rm(join(this.directory, name), { force: true })
      }
    }
    catch (error) {
      if (signal.aborted)
        throw new InternetError('CANCELLED', 'Local model import was cancelled. The previous model was preserved.')
      throw error
    }
    finally {
      await rm(temporary, { force: true })
      if (installed && !published && previous.sha256 !== sha256)
        await rm(this.path(sha256), { force: true })
    }
  }

  async cancel() {
    this.abort?.abort()
    await this.pending
  }

  async whenIdle() { await this.pending }
}
