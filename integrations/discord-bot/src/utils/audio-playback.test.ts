import process from 'node:process'

import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { createAudioResource, StreamType } from '@discordjs/voice'
import { expect, it } from 'vitest'

import { convertOpusToWav } from './audio'

it.runIf(process.env.ANGELA_DISCORD_AUDIO_TEST === '1')('converts real WAV bytes through FFmpeg and the installed Discord Opus encoder', async () => {
  const wav = convertOpusToWav(Buffer.alloc(16000 * 2))
  const resource = createAudioResource(Readable.from([wav]), { inputType: StreamType.Arbitrary })
  const frames: Buffer[] = []
  try {
    for await (const frame of resource.playStream)
      frames.push(Buffer.from(frame))
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every(frame => frame.length > 0)).toBe(true)
  }
  finally {
    resource.playStream.destroy()
  }
}, 10_000)
