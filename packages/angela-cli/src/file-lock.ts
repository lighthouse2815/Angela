import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { link, open, readFile, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'

import * as v from 'valibot'

const ownerSchema = v.object({ pid: v.pipe(v.number(), v.integer(), v.minValue(1)), hostname: v.string() })

/**
 * Acquires a private writer lock. The caller closes its handle before unlinking the path.
 * Recovery replaces only a lock whose same-host process is proven dead. Unknown owners remain locked.
 */
export async function acquireFileLock(path: string, message: string, recoverAbandoned = false) {
  const busy = () => new Error(message)
  const create = async () => {
    // Publish complete owner metadata atomically. A crash before publication cannot leave an empty writer lock.
    const temporary = `${path}.${randomUUID()}.owner`
    const lock = await open(temporary, 'wx', 0o600)
    let published = false
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, hostname: hostname() }))
      await link(temporary, path)
      published = true
      await unlink(temporary)
      return lock
    }
    catch (error) {
      await lock.close()
      if (published)
        await unlink(path)
      await unlink(temporary).catch(() => {})
      throw error
    }
  }
  try {
    return await create()
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST')
      throw error
    if (!recoverAbandoned)
      throw busy()
  }
  // Recovery ownership prevents competing restart processes from replacing each other's new writer lock.
  const recoveryPath = `${path}.recovery`
  const recovery = await open(recoveryPath, 'wx', 0o600).catch(() => {
    throw busy()
  })
  try {
    const owner = await readFile(path, 'utf8').then(source => v.parse(ownerSchema, JSON.parse(source))).catch(() => {
      throw busy()
    })
    if (owner.hostname !== hostname())
      throw busy()
    try {
      process.kill(owner.pid, 0)
      throw busy()
    }
    catch (error) {
      // Permission errors and PID reuse cannot prove that an owner exited.
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH')
        throw busy()
    }
    await unlink(path)
    return await create().catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
        throw busy()
      throw error
    })
  }
  finally {
    await recovery.close()
    await unlink(recoveryPath)
  }
}
