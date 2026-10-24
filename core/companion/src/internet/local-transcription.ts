import type { TranscriptionProvider, TranscriptSegment } from './contracts'
import type { MediaProcess } from './process'

import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'

import * as v from 'valibot'

import { InternetError, segmentSchema } from './contracts'

const responseSchema = v.object({ transcription: v.pipe(v.array(v.object({
  offsets: v.object({ from: v.pipe(v.number(), v.finite(), v.minValue(0)), to: v.pipe(v.number(), v.finite(), v.minValue(0)) }),
  text: v.pipe(v.string(), v.maxLength(8000)),
})), v.maxLength(10000)) })

/** Runs whisper.cpp locally. Only timestamped JSON is accepted. Audio and decoded WAV files are private and request-owned. */
export class LocalWhisperTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly process: MediaProcess, private readonly modelPath: string) {}

  async transcribe(audio: Uint8Array, signal?: AbortSignal): Promise<TranscriptSegment[]> {
    if (!audio.length || audio.length > 24 * 1024 * 1024)
      throw new InternetError('LIMIT_EXCEEDED', 'Local audio must contain at most 24 MiB.')
    signal?.throwIfAborted()
    const directory = await mkdtemp(join(tmpdir(), 'angela-whisper-'))
    try {
      await chmod(directory, 0o700)
      const source = join(directory, 'audio.m4a')
      const decoded = join(directory, 'audio.wav')
      const output = join(directory, 'result')
      await writeFile(source, audio, { mode: 0o600, flag: 'wx' })
      await this.process.run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-i', source, '-t', '600', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-fs', '20000000', decoded], { signal, timeout: 120000 })
      await this.process.run('whisper-cli', ['--model', this.modelPath, '--file', decoded, '--language', 'auto', '--threads', String(Math.min(4, availableParallelism())), '--output-json', '--output-file', output, '--no-prints'], { signal, timeout: 900000 })
      const path = `${output}.json`
      if ((await stat(path)).size > 8 * 1024 * 1024)
        throw new InternetError('LIMIT_EXCEEDED', 'Local transcription exceeded its result budget.')
      const parsed = v.safeParse(responseSchema, JSON.parse(await readFile(path, 'utf8')))
      if (!parsed.success)
        throw new InternetError('PROVIDER_FAILED', 'The local model returned no timestamped transcription.')
      const segments: TranscriptSegment[] = []
      for (const cue of parsed.output.transcription) {
        if (!cue.text.trim())
          continue
        // whisper.cpp JSON offsets are milliseconds within this chunk. YouTube extraction adds the source chunk offset once.
        const segment = v.safeParse(segmentSchema, { start: cue.offsets.from / 1000, end: cue.offsets.to / 1000, text: cue.text })
        if (!segment.success || segment.output.end > 601)
          throw new InternetError('PROVIDER_FAILED', 'The local model returned invalid audio timestamps.')
        segments.push(segment.output)
      }
      return segments
    }
    catch (error) {
      if (signal?.aborted)
        throw new InternetError('CANCELLED', 'Local transcription was cancelled.')
      if (error instanceof InternetError)
        throw error
      throw new InternetError('PROVIDER_FAILED', 'Local whisper.cpp transcription failed. Check the installed model and runtime.')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
