import { expect, it, vi } from 'vitest'

import { EchoCancellation } from './echo-cancellation'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => ({
  execFile: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: execute }),
}))

it('creates isolated WebRTC devices once and unloads only its own matching module', async () => {
  execute.mockReset()
  const echo = new EchoCancellation({ PATH: '/bin' })
  const other = new EchoCancellation({})
  execute.mockImplementation(async (_command: string, args: string[]) => {
    if (args[0] === 'list') {
      return { stdout: `1\tmodule-echo-cancel\tsource_name=${other.source} sink_name=${other.sink}\n2\tmodule-echo-cancel\tsource_name=${echo.source} sink_name=${echo.sink}\n3\tmodule-echo-cancel\tsource_name=${echo.source}_other sink_name=${echo.sink}\n` }
    }
    return { stdout: '2\n' }
  })
  await echo.start(new AbortController().signal)
  await echo.start(new AbortController().signal)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(echo.active).toBe(true)
  expect(execute).toHaveBeenCalledWith('pactl', ['load-module', 'module-echo-cancel', `source_name=${echo.source}`, `sink_name=${echo.sink}`, 'aec_method=webrtc'], expect.objectContaining({ env: { PATH: '/bin' } }))
  await echo.close()
  await echo.close()
  expect(execute.mock.calls.filter(([, args]) => args[0] === 'unload-module').map(([, args]) => args)).toEqual([['unload-module', '2']])
  expect(echo.active).toBe(false)
})

it('does not unload a reused module ID after the audio server restarts', async () => {
  execute.mockReset().mockResolvedValueOnce({ stdout: '2\n' }).mockResolvedValueOnce({ stdout: '2\tmodule-echo-cancel\tsource_name=someone_else sink_name=other\n' })
  const echo = new EchoCancellation({})
  await echo.start(new AbortController().signal)
  await echo.close()
  expect(execute).toHaveBeenCalledTimes(2)
})

it('finds a module created by a cancelled load even when the command never returned its ID', async () => {
  execute.mockReset()
  const echo = new EchoCancellation({})
  const controller = new AbortController()
  execute.mockImplementation(async (_command: string, args: string[]) => {
    if (args[0] === 'load-module') {
      controller.abort()
      throw controller.signal.reason
    }
    if (args[0] === 'list')
      return { stdout: `7\tmodule-echo-cancel\tsource_name=${echo.source} sink_name=${echo.sink}\n` }
    return { stdout: '' }
  })
  await expect(echo.start(controller.signal)).rejects.toThrow()
  expect(echo.active).toBe(false)
  expect(execute).toHaveBeenLastCalledWith('pactl', ['unload-module', '7'], expect.any(Object))
})

it('retries failed cleanup without touching filters owned by other sessions', async () => {
  execute.mockReset()
  const echo = new EchoCancellation({})
  execute.mockResolvedValueOnce({ stdout: '7\n' }).mockRejectedValueOnce(new Error('Pulse server unavailable')).mockResolvedValueOnce({ stdout: '' })
  await echo.start(new AbortController().signal)
  await expect(echo.close()).rejects.toThrow('Pulse server unavailable')
  await echo.close()
  expect(execute).toHaveBeenCalledTimes(3)
})

it('keeps cleanup a no-op when pactl is missing or startup was already cancelled', async () => {
  execute.mockReset().mockRejectedValue(Object.assign(new Error('Missing pactl'), { code: 'ENOENT' }))
  const echo = new EchoCancellation({})
  await expect(echo.start(new AbortController().signal)).rejects.toThrow('Missing pactl')
  await echo.close()
  expect(execute).toHaveBeenCalledTimes(1)
  const controller = new AbortController()
  controller.abort()
  await expect(new EchoCancellation({}).start(controller.signal)).rejects.toThrow()
  expect(execute).toHaveBeenCalledTimes(1)
})
