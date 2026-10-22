import process from 'node:process'

import { EventEmitter } from 'node:events'

import { afterEach, expect, it, vi } from 'vitest'

import { runVoiceService } from './voice-service'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, spawn }
})

afterEach(() => {
  spawn.mockReset()
  vi.restoreAllMocks()
})

it('stops only the voice service from any working directory and keeps model volumes', async () => {
  spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
  await runVoiceService(['stop'], process.env)
  expect(spawn).toHaveBeenCalledWith('docker', ['compose', '--file', expect.stringMatching(/services\/voice-local\/compose\.yaml$/), 'stop', 'voice'], expect.objectContaining({ stdio: 'inherit' }))
})

it('rejects unknown commands before starting Docker', async () => {
  await expect(runVoiceService(['delete-volumes'], process.env)).rejects.toThrow('angela voice start|stop|status')
  expect(spawn).not.toHaveBeenCalled()
})

it('explains a missing Docker executable without masking it as service readiness', async () => {
  spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('error', new Error('spawn ENOENT')))
    return child
  })
  await expect(runVoiceService(['start', '--locale', 'en'], process.env)).rejects.toThrow('Install Docker with Compose')
})
