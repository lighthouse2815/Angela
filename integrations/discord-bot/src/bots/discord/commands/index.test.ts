import { REST } from 'discord.js'
import { expect, it, vi } from 'vitest'

import { registerCommands } from './index'

it('registers call controls and waits for registration to finish', async () => {
  const completed = Promise.withResolvers<void>()
  const put = vi.spyOn(REST.prototype, 'put').mockReturnValueOnce(completed.promise)
  let registered = false
  const pending = registerCommands('test-token', '42').then(() => {
    registered = true
  })
  await Promise.resolve()
  const body = put.mock.calls[0][1]?.body as { name: string }[]
  expect(body.map(command => command.name)).toEqual(expect.arrayContaining(['summon', 'leave', 'listen']))
  expect(registered).toBe(false)
  completed.resolve()
  await pending
  expect(registered).toBe(true)
  put.mockRestore()
})
