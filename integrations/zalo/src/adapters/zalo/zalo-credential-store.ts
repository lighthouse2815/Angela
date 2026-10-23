import type { Credentials } from 'zca-js'

import type { ZaloCredentials, ZaloCredentialStore, ZaloLoginDisplay } from './zalo-types'

import { Buffer } from 'node:buffer'
import { chmod, mkdir, open, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { MemoryFile } from '@angela/companion/memory-file'

import * as v from 'valibot'

const sessionSchema = v.custom<Credentials>((input) => {
  if (!input || typeof input !== 'object')
    return false
  return 'imei' in input && typeof input.imei === 'string' && input.imei.length > 0
    && 'userAgent' in input && typeof input.userAgent === 'string' && input.userAgent.length > 0
    && 'cookie' in input && Array.isArray(input.cookie) && input.cookie.length > 0
    && input.cookie.every(cookie => cookie && typeof cookie === 'object' && typeof cookie.value === 'string')
})
const schema = v.object({ credentials: v.nullable(v.object({ accountId: v.pipe(v.string(), v.regex(/^\d{1,30}$/u)), session: sessionSchema })) })

/** Local secrets use private atomic files. Clear erases session material without exposing SDK error text. */
export class LocalZaloCredentialStore implements ZaloCredentialStore, ZaloLoginDisplay {
  private readonly file: MemoryFile<v.InferOutput<typeof schema>>

  constructor(private readonly directory: string, private readonly showPath: (path: string) => void) {
    this.file = new MemoryFile(directory, 'zalo-credentials', schema, () => ({ credentials: null }), {
      invalid: 'Zalo credential storage is invalid',
      locked: 'Zalo credential storage is busy',
    })
  }

  async load() {
    try {
      const state = await this.file.read()
      if (state.credentials)
        await chmod(join(this.directory, 'zalo-credentials.json'), 0o600)
      return state.credentials
    }
    catch { throw new Error('Zalo credentials unavailable') }
  }

  async save(credentials: ZaloCredentials) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    await this.file.edit((state) => {
      state.credentials = credentials
    })
  }

  async clear() {
    // Use the same cross-process lock as save. Empty credentials cannot restore a session.
    await this.file.edit((state) => {
      state.credentials = null
    })
    await this.clearQr()
  }

  async show(image: string) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    const path = join(this.directory, 'zalo-login-qr.png')
    await writeFile(path, Buffer.from(image.replace(/^data:image\/png;base64,/u, ''), 'base64'), { mode: 0o600 })
    await chmod(path, 0o600)
    this.showPath(path)
  }

  async clearQr() {
    await unlink(join(this.directory, 'zalo-login-qr.png')).catch((error: unknown) => {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        throw new Error('Zalo QR cleanup failed')
    })
  }

  /** A local host lease prevents concurrent listeners and rate-limit races across Angela processes. */
  async acquireHost() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    const path = join(this.directory, 'zalo-host.lock')
    const lock = await open(path, 'wx', 0o600).catch(() => {
      throw new Error('Zalo host is active or its lease needs review')
    })
    return async () => {
      await lock.close()
      await unlink(path)
    }
  }
}
