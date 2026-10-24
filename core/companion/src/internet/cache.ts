import type { TranscriptCache } from '../internet'
import type { Transcript } from './contracts'

import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

import { InternetError, transcriptSchema } from './contracts'

/**
 * Owns at most 100 private transcript files with a configurable TTL. Writes use atomic replacement.
 * Corrupt, oversized, expired, or mismatched entries become misses. Transient audio never enters this store.
 */
export class FileTranscriptCache implements TranscriptCache {
  constructor(private readonly directory: string, private readonly now = Date.now, private readonly ttlDays = () => 30) {}

  private path(videoId: string) {
    if (!/^[\w-]{11}$/u.test(videoId))
      throw new InternetError('INVALID_URL', 'Invalid transcript cache key.')
    return join(this.directory, `video-transcript-youtube-${videoId}.json`)
  }

  async get(videoId: string): Promise<Transcript | undefined> {
    const path = this.path(videoId)
    try {
      const file = await open(path, 'r')
      try {
        const info = await file.stat()
        if (!info.isFile() || info.size > 8 * 1024 * 1024)
          return undefined
        const buffer = new Uint8Array(8 * 1024 * 1024 + 1)
        let size = 0
        while (size < buffer.length) {
          const read = await file.read(buffer, size, buffer.length - size, size)
          if (!read.bytesRead)
            break
          size += read.bytesRead
        }
        if (size > 8 * 1024 * 1024)
          return undefined
        const transcript = v.parse(transcriptSchema, JSON.parse(new TextDecoder().decode(buffer.subarray(0, size))))
        const age = this.now() - transcript.generatedAt
        const days = v.parse(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(90)), this.ttlDays())
        if (transcript.videoId === videoId && age >= 0 && age < days * 86400 * 1000)
          return transcript
      }
      finally {
        await file.close()
      }
    }
    catch {
      // Cache failures do not convert missing evidence into successful empty transcripts.
    }
    return undefined
  }

  async set(input: Transcript) {
    const transcript = v.parse(transcriptSchema, input)
    const path = this.path(transcript.videoId)
    const data = JSON.stringify(transcript)
    if (new TextEncoder().encode(data).byteLength > 8 * 1024 * 1024)
      throw new InternetError('LIMIT_EXCEEDED', 'Transcript exceeds the 8 MiB cache budget.')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = join(this.directory, `${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
      await rename(temporary, path)
      const names = (await readdir(this.directory)).filter(name => /^video-transcript-youtube-[\w-]{11}\.json$/u.test(name))
      const entries = await Promise.all(names.map(async name => ({ name, modified: (await stat(join(this.directory, name))).mtimeMs })))
      entries.sort((a, b) => b.modified - a.modified)
      for (const entry of entries.slice(100))
        await unlink(join(this.directory, entry.name))
    }
    finally {
      await unlink(temporary).catch(() => {})
    }
  }
}
