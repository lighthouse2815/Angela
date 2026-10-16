import { cliMessages } from '@proj-airi/i18n/cli'
import { expect, it, vi } from 'vitest'

import { StreamingSpeech } from './streaming-speech'
import { Voice } from './voice'

function setup() {
  const voice = new Voice({ ANGELA_VOICE_BASE_URL: 'http://localhost/v1/' }, cliMessages.en)
  const speak = vi.spyOn(voice, 'speak').mockResolvedValue()
  const started = vi.fn()
  const controller = new AbortController()
  return { speak, started, controller, stream: new StreamingSpeech(voice, controller.signal, started) }
}

it('speaks a complete opening sentence before generation finishes and flushes the final fragment in order', async () => {
  const { stream, speak, started } = setup()
  await stream.push('Xin chào Angela. Mình ')
  await vi.waitFor(() => expect(speak).toHaveBeenCalled())
  expect(started).toHaveBeenCalledTimes(1)
  await stream.push('đang nghe bạn')
  await stream.finish()
  expect(speak.mock.calls.map(([text]) => text).join(' ')).toContain('đang nghe bạn')
  expect(speak.mock.calls[0]?.[0]).toContain('Xin chào Angela')
  await stream.cancel()
})

it('continues accepting text after audio fails and reports failure only when the reply finishes', async () => {
  const { stream, speak } = setup()
  speak.mockRejectedValue(new Error('TTS unavailable'))
  await stream.push('Xin chào. Câu tiếp theo ')
  await vi.waitFor(() => expect(speak).toHaveBeenCalled())
  await expect(stream.push('vẫn được sinh ra.')).resolves.toBeUndefined()
  await expect(stream.finish()).rejects.toThrow('TTS unavailable')
  await stream.cancel()
})

it('bounds pending text behind slow audio and cancels the current playback and queued sentences', async () => {
  const { stream, speak, controller } = setup()
  speak.mockImplementation(async (_text, signal) => await new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  await stream.push('Câu đầu tiên. Câu ')
  await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1))
  let delivered = false
  const pending = stream.push('Một câu đang chờ. '.repeat(4000)).then(() => {
    delivered = true
  }).catch(() => {})
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(delivered).toBe(false)
  controller.abort()
  await pending
  await stream.cancel()
  expect(speak).toHaveBeenCalledTimes(1)
  await expect(stream.push('Không đọc nữa.')).rejects.toThrow()
})

it('cancels the final audio drain after text generation has completed', async () => {
  const { stream, speak, controller } = setup()
  speak.mockImplementation(async (_text, signal) => await new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  await stream.push('Câu trả lời đã hoàn thành')
  const finished = stream.finish()
  await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1))
  controller.abort()
  await expect(finished).rejects.toThrow()
  await stream.cancel()
  expect(speak).toHaveBeenCalledTimes(1)
})
