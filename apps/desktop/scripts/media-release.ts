import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/** A reviewed download is identified by its bytes, independently of redirects or upstream tag changes. */
export interface PinnedMediaAsset { url: string, sha256: string }

/** Hashes a regular release file without loading executables or source archives into memory. */
export async function mediaDigest(path: string) {
  if (!(await lstat(path)).isFile())
    throw new Error('Release input must be a regular file')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path))
    hash.update(chunk)
  return hash.digest('hex')
}

/** Downloads into a private staging file. Failed verification never replaces a valid cached artifact. */
export async function downloadMediaAsset(asset: PinnedMediaAsset, cache: string, maxBytes = 128 * 1024 * 1024) {
  if (!/^[a-f0-9]{64}$/u.test(asset.sha256))
    throw new Error('Invalid pinned media checksum')
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const destination = join(cache, asset.sha256)
  try {
    if (await mediaDigest(destination) === asset.sha256)
      return destination
  }
  catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT')
      throw cause
  }
  const temporary = `${destination}.${randomUUID()}.partial`
  const file = await open(temporary, 'wx', 0o600)
  const abort = new AbortController()
  const hash = createHash('sha256')
  try {
    const response = await fetch(asset.url, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]) })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`Media download failed: HTTP ${response.status}`)
    }
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.byteLength
      if (size > maxBytes)
        throw new Error('Media download exceeds its size budget')
      hash.update(chunk)
      await file.writeFile(chunk)
    }
    if (hash.digest('hex') !== asset.sha256)
      throw new Error('Media download checksum mismatch')
    await file.close()
    await rename(temporary, destination)
    return destination
  }
  finally {
    abort.abort()
    await file.close()
    await rm(temporary, { force: true })
  }
}

/** Reads a build manifest for exact-byte reuse. A changed recipe requires a new staging run. */
export async function matchesMediaRecipe(directory: string, recipe: string) {
  try {
    const value: unknown = JSON.parse(await readFile(join(directory, 'recipe.json'), 'utf8'))
    return typeof value === 'object' && value !== null && 'sha256' in value && value.sha256 === recipe
  }
  catch (cause) {
    if (cause instanceof SyntaxError || (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
      return false
    throw cause
  }
}
