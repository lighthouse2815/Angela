import type { Task } from './task-schema'

import { randomUUID } from 'node:crypto'

import { cliMessages } from '@proj-airi/i18n/cli'
import { expect, it, vi } from 'vitest'

import { ReminderNotifications } from './reminder-notifications'

const messages = cliMessages.en.tasks
function task(title: string): Task {
  return { id: randomUUID(), title, type: 'reminder', timezone: 'Asia/Ho_Chi_Minh', status: 'pending', dueAt: '2026-10-17T15:00:00.000Z', createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' }
}

it('delivers text before optional speech and retains task IDs for conversational context', async () => {
  const present = vi.fn()
  const notifications = new ReminderNotifications(messages, 'en', present)
  const reminder = task('Study Chinese')
  await notifications.notify([reminder], true, new AbortController().signal)
  expect(present).toHaveBeenCalledOnce()
  expect(present.mock.calls[0]![0]).toContain(messages.overdue)
  expect(present.mock.calls[0]![0]).toContain(reminder.id)
  expect(present.mock.calls[0]![1]).toEqual([reminder])
  expect(notifications.hasSpeech).toBe(false)
})

it('buffers notifications during a reply or approval and queues audio after the current utterance', async () => {
  const present = vi.fn()
  const speak = vi.fn().mockResolvedValue(undefined)
  const notifications = new ReminderNotifications(messages, 'vi', present)
  notifications.setVoiceEnabled(true)
  notifications.pause()
  const delivering = notifications.notify([task('Ôn từ')], false, new AbortController().signal)
  await notifications.speak({ speak }, new AbortController().signal)
  expect(present).not.toHaveBeenCalled()
  expect(speak).not.toHaveBeenCalled()
  notifications.resume()
  await delivering
  expect(present).toHaveBeenCalledOnce()
  expect(notifications.hasSpeech).toBe(true)
  await notifications.speak({ speak }, new AbortController().signal)
  expect(speak).toHaveBeenCalledOnce()
  expect(speak.mock.calls[0]![0]).toContain('Ôn từ')
  expect(notifications.hasSpeech).toBe(false)
})

it('serializes speech, preserves text on TTS failure and stops after cancellation', async () => {
  const present = vi.fn()
  const notifications = new ReminderNotifications(messages, 'en', present)
  notifications.setVoiceEnabled(true)
  const controller = new AbortController()
  const speak = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockImplementationOnce(async () => {
    controller.abort()
  })
  await notifications.notify([task('First')], false, controller.signal)
  await notifications.notify([task('Second')], false, controller.signal)
  await notifications.notify([task('Third')], false, controller.signal)
  await Promise.all([notifications.speak({ speak }, controller.signal), notifications.speak({ speak }, controller.signal)])
  expect(speak).toHaveBeenCalledTimes(2)
  expect(present.mock.calls.filter(([text]) => text === messages.voiceFailed)).toHaveLength(1)
  expect(present.mock.calls[0]![0]).toContain('First')
  expect(present.mock.calls[1]![0]).toContain('Second')
  notifications.setVoiceEnabled(false)
  expect(notifications.hasSpeech).toBe(false)
})

it('rejects a cancelled notification before presentation and removes terminal escape sequences', async () => {
  const present = vi.fn()
  const notifications = new ReminderNotifications(messages, 'en', present)
  const controller = new AbortController()
  controller.abort()
  await expect(notifications.notify([task('Cancelled')], false, controller.signal)).rejects.toThrow()
  expect(present).not.toHaveBeenCalled()
  await notifications.notify([task('Safe\u001B[31m title')], false, new AbortController().signal)
  expect(present.mock.calls[0]![0]).not.toContain('\u001B')
})

it('does not acknowledge a queued notification before presentation and cancels it on shutdown', async () => {
  const present = vi.fn()
  const notifications = new ReminderNotifications(messages, 'en', present)
  notifications.pause()
  const controller = new AbortController()
  let acknowledged = false
  const pending = notifications.notify([task('Queued')], false, controller.signal).then(() => {
    acknowledged = true
  })
  const rejected = expect(pending).rejects.toThrow()
  expect(acknowledged).toBe(false)
  expect(present).not.toHaveBeenCalled()
  controller.abort()
  await rejected
  notifications.resume()
  expect(present).not.toHaveBeenCalled()
})

it('checks ownership after the pause and propagates presentation failures to the scheduler', async () => {
  const present = vi.fn().mockRejectedValue(new Error('Write failed'))
  const notifications = new ReminderNotifications(messages, 'en', present)
  notifications.pause()
  const verify = vi.fn().mockRejectedValue(new Error('Claim changed'))
  const pending = notifications.notify([task('Old task')], false, new AbortController().signal, verify)
  const rejected = expect(pending).rejects.toThrow('Claim changed')
  notifications.resume()
  await rejected
  expect(present).not.toHaveBeenCalled()
  await expect(notifications.notify([task('New task')], false, new AbortController().signal)).rejects.toThrow('Write failed')
})

it('bounds pending voice announcements while preserving every text reminder', async () => {
  const present = vi.fn()
  const speak = vi.fn().mockResolvedValue(undefined)
  const notifications = new ReminderNotifications(messages, 'en', present)
  notifications.setVoiceEnabled(true)
  for (let index = 0; index < 40; index++)
    await notifications.notify([task(`Reminder ${index}`)], false, new AbortController().signal)
  await notifications.speak({ speak }, new AbortController().signal)
  expect(present).toHaveBeenCalledTimes(40)
  expect(speak).toHaveBeenCalledTimes(8)
  expect(speak.mock.calls[0][0]).toContain('Reminder 32')
  expect(speak.mock.calls.at(-1)?.[0]).toContain('Reminder 39')
})
