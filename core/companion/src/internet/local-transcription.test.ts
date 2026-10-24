import process from 'node:process'

import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { LocalWhisperTranscriptionProvider } from './local-transcription'
import { MediaProcess } from './process'

describe('local whisper.cpp timestamp protocol', () => {
  it('preserves fractional timestamps and cleans chunk-owned files', async () => {
    let temporary = ''
    const run = vi.fn<MediaProcess['run']>(async (executable, args) => {
      if (executable === 'whisper-cli') {
        const output = args[args.indexOf('--output-file') + 1]!
        temporary = output
        await writeFile(`${output}.json`, JSON.stringify({ transcription: [{ offsets: { from: 1200, to: 3450 }, text: 'AddScoped' }] }))
      }
      return ''
    })
    expect(await new LocalWhisperTranscriptionProvider({ run }, 'verified-model.bin').transcribe(new Uint8Array([1]))).toEqual([{ start: 1.2, end: 3.45, text: 'AddScoped' }])
    expect(run).toHaveBeenCalledWith('whisper-cli', expect.arrayContaining(['--model', 'verified-model.bin', '--output-json']), expect.any(Object))
    await expect(access(`${temporary}.json`)).rejects.toThrow()
  })

  it('rejects plain paragraphs and invalid offsets instead of inventing timestamps', async () => {
    const run = vi.fn<MediaProcess['run']>(async (executable, args) => {
      if (executable === 'whisper-cli')
        await writeFile(`${args[args.indexOf('--output-file') + 1]}.json`, JSON.stringify({ text: 'No timestamp information' }))
      return ''
    })
    await expect(new LocalWhisperTranscriptionProvider({ run }, 'verified-model.bin').transcribe(new Uint8Array([1]))).rejects.toThrow('timestamped transcription')
  })

  it('cleans files after inference failure without a network fallback', async () => {
    let directory = ''
    const run = vi.fn<MediaProcess['run']>(async (_executable, args) => {
      directory = dirname(args[args.indexOf('-i') + 1]!)
      throw new Error('Native failure')
    })
    await expect(new LocalWhisperTranscriptionProvider({ run }, 'model.bin').transcribe(new Uint8Array([1]))).rejects.toThrow('PROVIDER_FAILED')
    expect(directory).not.toBe('')
    await expect(access(directory)).rejects.toThrow()
  })

  it.runIf(process.env.ANGELA_TEST_FFMPEG && process.env.ANGELA_TEST_WHISPER && process.env.ANGELA_TEST_WHISPER_MODEL && process.env.ANGELA_TEST_WHISPER_AUDIO)('transcribes a real speech fixture through the native whisper.cpp runtime', async () => {
    const media = new MediaProcess()
    const run: MediaProcess['run'] = (executable, args, options) => media.run(executable === 'ffmpeg' ? process.env.ANGELA_TEST_FFMPEG! : process.env.ANGELA_TEST_WHISPER!, args, options)
    const result = await new LocalWhisperTranscriptionProvider({ run }, process.env.ANGELA_TEST_WHISPER_MODEL!).transcribe(await readFile(process.env.ANGELA_TEST_WHISPER_AUDIO!))
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(segment => segment.end > segment.start && segment.start >= 0)).toBe(true)
    expect(result.some(segment => segment.end > 1)).toBe(true)
    expect(result.map(segment => segment.text).join(' ').toLowerCase()).toContain('country')
  }, 120000)

  it.runIf(process.env.ANGELA_TEST_FFMPEG)('decodes a real M4A chunk through FFmpeg before local inference', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angela-local-audio-'))
    const media = new MediaProcess()
    try {
      const source = join(directory, 'source.m4a')
      await media.run(process.env.ANGELA_TEST_FFMPEG!, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', source])
      const run: MediaProcess['run'] = async (executable, args, options) => {
        if (executable === 'ffmpeg')
          return media.run(process.env.ANGELA_TEST_FFMPEG!, args, options)
        const wav = await readFile(args[args.indexOf('--file') + 1]!)
        expect(wav.subarray(0, 4).toString()).toBe('RIFF')
        await writeFile(`${args[args.indexOf('--output-file') + 1]}.json`, JSON.stringify({ transcription: [{ offsets: { from: 0, to: 1000 }, text: 'Local result' }] }))
        return ''
      }
      expect(await new LocalWhisperTranscriptionProvider({ run }, 'model.bin').transcribe(await readFile(source))).toEqual([{ start: 0, end: 1, text: 'Local result' }])
    }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
})
