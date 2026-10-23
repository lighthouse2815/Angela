import process from 'node:process'

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

import { cliMessages } from '@angela/i18n/cli'
import { expect, it } from 'vitest'

import { Voice } from './voice'
import { VoiceInterruption } from './voice-interruption'

const execute = promisify(execFile)

// This opt-in test uses the configured speech service and temporary virtual devices, without opening physical audio devices.
it.skipIf(process.env.ANGELA_TEST_PIPEWIRE !== '1' || process.platform !== 'linux')('captures real PipeWire audio, interrupts a turn and transcribes synthesized Vietnamese', async () => {
  const name = `angela_test_${randomUUID().replaceAll('-', '')}`
  const modules: { id: string, argument: string }[] = []
  const lifetime = new AbortController()
  let interruption: VoiceInterruption | undefined
  try {
    for (const args of [
      ['module-null-sink', `sink_name=${name}`],
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
    expect(await voice.healthy()).toBe(true)
    expect(voice.canInterrupt).toBe(true)
    const ready = Promise.withResolvers<void>()
    const speech = Promise.withResolvers<void>()
    const turn = new AbortController()
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
      const started = performance.now()
      const playback = voice.speak('Xin chào, tôi là một trợ lý ảo. Tôi muốn nói chuyện với bạn.', lifetime.signal)
      const onset = await Promise.race([
        Promise.all([playback, speech.promise.then(() => performance.now() - started)]).then(([, onset]) => onset),
        expired.promise,
      ])
      expect(turn.signal.aborted).toBe(true)
      const transcript = await Promise.race([interruption.finish(), expired.promise])
      expect(transcript?.toLocaleLowerCase('vi')).toContain('xin chào')
      console.info(`PipeWire speech onset ${Math.round(onset)}ms, transcript ${Math.round(performance.now() - started)}ms`)
    }
    finally {
      clearTimeout(timeout)
    }
  }
  finally {
    lifetime.abort()
    interruption?.cancel()
    await interruption?.finish()
    for (const module of modules.reverse()) {
      const list = await execute('pactl', ['list', 'short', 'modules'], { timeout: 5000 })
      if (list.stdout.split('\n').some(line => line.startsWith(`${module.id}\t`) && line.split('\t')[2]?.split(/\s+/u).includes(module.argument)))
        await execute('pactl', ['unload-module', module.id], { timeout: 5000 })
    }
  }
}, 110_000)
