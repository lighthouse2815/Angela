import process from 'node:process'

import { Buffer } from 'node:buffer'

import { generateSpeech } from '@xsai/generate-speech'
import { generateTranscription } from '@xsai/generate-transcription'

import * as v from 'valibot'

const endpoint = v.pipe(v.string(), v.url(), v.check((value) => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
}), v.transform(value => `${value.replace(/\/+$/u, '')}/`))
const configuration = v.object({
  sttUrl: endpoint,
  sttModel: v.pipe(v.string(), v.minLength(1)),
  ttsUrl: endpoint,
  ttsModel: v.pipe(v.string(), v.minLength(1)),
  voice: v.pipe(v.string(), v.minLength(1)),
})

/** Uses the existing speech SDKs without loading a local model or saving audio files. */
export class Speech {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  validate() {
    return v.parse(configuration, {
      sttUrl: this.env.OPENAI_STT_API_BASE_URL,
      sttModel: this.env.OPENAI_STT_MODEL,
      ttsUrl: this.env.OPENAI_TTS_API_BASE_URL,
      ttsModel: this.env.OPENAI_TTS_MODEL,
      voice: this.env.OPENAI_TTS_VOICE,
    })
  }

  async transcribe(wav: Buffer, signal: AbortSignal) {
    const config = this.validate()
    const result = await generateTranscription({
      baseURL: config.sttUrl,
      model: config.sttModel,
      apiKey: this.env.OPENAI_STT_API_KEY,
      language: this.env.OPENAI_STT_LANGUAGE,
      file: new Blob([new Uint8Array(wav)], { type: 'audio/wav' }),
      fileName: 'discord-voice.wav',
      abortSignal: signal,
    })
    return v.parse(v.object({ text: v.string() }), result).text.trim()
  }

  async synthesize(text: string, signal: AbortSignal) {
    const config = this.validate()
    const audio = await generateSpeech({
      baseURL: config.ttsUrl,
      model: config.ttsModel,
      apiKey: this.env.OPENAI_TTS_API_KEY,
      voice: config.voice,
      input: text,
      responseFormat: 'wav',
      abortSignal: signal,
    })
    if (!audio.byteLength || audio.byteLength > 20_000_000)
      throw new Error('Invalid speech response size')
    return Buffer.from(audio)
  }
}
