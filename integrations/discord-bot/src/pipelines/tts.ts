import type { Buffer } from 'node:buffer'

import type { AutomaticSpeechRecognitionPipeline, PretrainedModelOptions } from '@huggingface/transformers'

import { env } from 'node:process'

import wavefile from 'wavefile'

import { useLogg } from '@guiiai/logg'
import { pipeline } from '@huggingface/transformers'
import { toWav } from '@proj-airi/audio'
import { createOpenAI } from '@xsai-ext/providers/create'
import { generateTranscription } from '@xsai/generate-transcription'

export class WhisperLargeV3Pipeline {
  static task = 'automatic-speech-recognition' as const
  static model = 'Xenova/whisper-medium.en'
  static instance: AutomaticSpeechRecognitionPipeline | null = null

  static async getInstance(progress_callback?: PretrainedModelOptions['progress_callback']) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { progress_callback })
    }

    return this.instance
  }
}

export function textFromResult(result: Array<{ text: string }> | { text: string }) {
  if (Array.isArray(result)) {
    const arrayResult = result as { text: string }[]
    if (arrayResult.length === 0) {
      return ''
    }

    return result[0].text
  }
  else {
    if ('text' in result) {
      return result.text
    }
    else {
      return ''
    }
  }
}

export async function transcribe(pcmBuffer: Buffer) {
  const log = useLogg('Memory:Transcribe').useGlobalConfig()

  const pcmConvertedWav = toWav(pcmBuffer.buffer, 48000, 2)
  log.withFields({ from: pcmBuffer.byteLength, to: pcmConvertedWav.byteLength }).log('Audio data received')

  const transcriber = await WhisperLargeV3Pipeline.getInstance()
  log.log('Transcribing audio')

  const wav = new wavefile.WaveFile(new Uint8Array(pcmConvertedWav))
  wav.toBitDepth('32f') // Pipeline expects input as a Float32Array
  wav.toSampleRate(16000) // Whisper expects audio with a sampling rate of 16000
  const audioData = wav.getSamples()

  const result = await transcriber(audioData)
  const text = textFromResult(result)
  if (!text) {
    log.log('No transcription result')
    return ''
  }

  log.withField('result', text).log('Transcription result')
  return text
}

export async function openaiTranscribe(wavBuffer: Buffer) {
  const log = useLogg('Remote:Transcribe').useGlobalConfig()

  log.log('Transcribing audio...')

  const model = env.OPENAI_STT_MODEL
  // An unset model keeps this optional transcription helper disabled.
  if (!model)
    return ''
  const wavFile = new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' })
  const openai = createOpenAI(env.OPENAI_STT_API_KEY ?? '', env.OPENAI_STT_API_BASE_URL)

  try {
    const result = await generateTranscription({
      ...openai.transcription(model),
      file: wavFile,
    })

    log.withField('result', result.text).log('Transcription result')
    return result.text
  }
  catch (err) {
    log.withError(err).error('Failed to transcribe audio')
  }

  return ''
}
