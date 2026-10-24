import process from 'node:process'

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it } from 'vitest'

import { Voice } from './voice'
import { VoiceInterruption } from './voice-interruption'

const execute = promisify(execFile)

// This opt-in test uses the configured speech service and temporary virtual devices, without opening physical audio devices.
it.skipIf(process.env.ANGELA_TEST_PIPEWIRE !== '1' || process.platform !== 'linux').each([1, 2, 3])('round %i: interrupts real playback and transcribes Vietnamese through PipeWire', async (round) => {
  const name = `angela_test_${randomUUID().replaceAll('-', '')}`
  const modules: { id: string, argument: string }[] = []
  const lifetime = new AbortController()
  let interruption: VoiceInterruption | undefined
  let playbackStopped: Promise<unknown> | undefined
  let cueStopped: Promise<unknown> | undefined
  try {
    for (const args of [
      ['module-null-sink', `sink_name=${name}`],
      ['module-null-sink', `sink_name=${name}_assistant`],
      ['module-remap-source', `master=${name}.monitor`, `source_name=${name}_source`],
    ]) {
      const result = await execute('pactl', ['load-module', ...args], { timeout: 10_000 })
      modules.push({ id: result.stdout.trim(), argument: args.at(-1)! })
    }
    const voice = new Voice({
      ...process.env,
      ANGELA_VOICE_BASE_URL: process.env.ANGELA_VOICE_BASE_URL ?? 'http://127.0.0.1:8000/v1/',
      ANGELA_STT_MODEL: process.env.ANGELA_STT_MODEL ?? 'small',
      ANGELA_TTS_MODEL: process.env.ANGELA_TTS_MODEL ?? 'edge-tts',
      ANGELA_TTS_VOICE: process.env.ANGELA_TTS_VOICE ?? 'vi-VN-HoaiMyNeural',
      ANGELA_VOICE_SOURCE: `${name}_source`,
      ANGELA_VOICE_SINK: name,
    }, cliMessages.en)
    const assistant = new Voice({
      ...process.env,
      ANGELA_VOICE_BASE_URL: process.env.ANGELA_VOICE_BASE_URL ?? 'http://127.0.0.1:8000/v1/',
      ANGELA_TTS_MODEL: process.env.ANGELA_TTS_MODEL ?? 'edge-tts',
      ANGELA_TTS_VOICE: process.env.ANGELA_TTS_VOICE ?? 'vi-VN-HoaiMyNeural',
      ANGELA_VOICE_SINK: `${name}_assistant`,
    }, cliMessages.en)
    expect(await voice.healthy()).toBe(true)
    expect(voice.canInterrupt).toBe(true)
    const ready = Promise.withResolvers<void>()
    const speech = Promise.withResolvers<void>()
    const turn = new AbortController()
    const abortPlayback = () => turn.abort(lifetime.signal.reason)
    lifetime.signal.addEventListener('abort', abortPlayback, { once: true })
    interruption = new VoiceInterruption(voice, turn, (state) => {
      if (state === 'ready')
        ready.resolve()
      if (state === 'speech')
        speech.resolve()
    })
    const expired = Promise.withResolvers<never>()
    const timeout = setTimeout(() => {
      lifetime.abort(new Error('Live speech test timed out'))
      expired.reject(lifetime.signal.reason)
      interruption?.cancel()
    }, 90_000)
    try {
      await Promise.race([ready.promise, expired.promise])
      const oldPlayback = assistant.speak('Tôi đang giải thích bài học. Bạn có thể ngắt lời để đặt một câu hỏi mới bất cứ lúc nào. '.repeat(5), turn.signal).then(() => ({ status: 'finished' as const }), error => ({ status: 'cancelled' as const, error }))
      playbackStopped = oldPlayback
      const sinks = await execute('pactl', ['list', 'short', 'sinks'], { timeout: 5000 })
      const sinkId = sinks.stdout.split('\n').find(line => line.split('\t')[1] === `${name}_assistant`)?.split('\t')[0]
      expect(sinkId).toBeDefined()
      await expect.poll(async () => {
        const inputs = await execute('pactl', ['list', 'short', 'sink-inputs'], { timeout: 5000 })
        return inputs.stdout.split('\n').some(line => line.split('\t')[1] === sinkId)
      }, { timeout: 30000 }).toBe(true)
      const started = performance.now()
      const playback = voice.speak('Xin chào, tôi là một trợ lý ảo. Tôi muốn nói chuyện với bạn.', lifetime.signal)
      cueStopped = playback.catch(() => {})
      const onset = await Promise.race([
        speech.promise.then(() => performance.now() - started),
        expired.promise,
      ])
      expect(turn.signal.aborted).toBe(true)
      expect(await oldPlayback).toMatchObject({ status: 'cancelled', error: turn.signal.reason })
      const stopMs = performance.now() - started - onset
      expect(stopMs).toBeLessThan(3000)
      const remaining = await execute('pactl', ['list', 'short', 'sink-inputs'], { timeout: 5000 })
      expect(remaining.stdout.split('\n').some(line => line.split('\t')[1] === sinkId)).toBe(false)
      await Promise.race([playback, expired.promise])
      const transcript = await Promise.race([interruption.finish(), expired.promise])
      expect(transcript?.toLocaleLowerCase('vi')).toContain('xin chào')
      const metrics = { round, transport: 'virtual-pipewire', onsetMs: Math.round(onset), playbackCleanupMs: Math.round(stopMs), transcriptMs: Math.round(performance.now() - started) }
      console.info(metrics)
      if (process.env.ANGELA_VOICE_REPORT) {
        await mkdir(dirname(process.env.ANGELA_VOICE_REPORT), { recursive: true })
        await appendFile(process.env.ANGELA_VOICE_REPORT, `${JSON.stringify(metrics)}\n`, { mode: 0o600 })
      }
    }
    finally {
      clearTimeout(timeout)
    }
  }
  finally {
    lifetime.abort()
    interruption?.cancel()
    await Promise.all([playbackStopped, cueStopped])
    await interruption?.finish()
    for (const module of modules.reverse()) {
      const list = await execute('pactl', ['list', 'short', 'modules'], { timeout: 5000 })
      if (list.stdout.split('\n').some(line => line.startsWith(`${module.id}\t`) && line.split('\t')[2]?.split(/\s+/u).includes(module.argument)))
        await execute('pactl', ['unload-module', module.id], { timeout: 5000 })
    }
  }
}, 110_000)
