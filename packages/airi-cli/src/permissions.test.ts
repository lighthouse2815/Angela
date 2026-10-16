import { cliMessages } from '@proj-airi/i18n/cli'
import { expect, it } from 'vitest'

import { Permissions } from './permissions'

it('starts with confirmation and reports the selected mode without toggling it', () => {
  const permissions = new Permissions(cliMessages.vi)
  expect(permissions.fullAccess).toBe(false)
  expect(permissions.command('/permistion')).toContain(cliMessages.vi.permissionAsk)
  expect(permissions.command('/permistion full')).toContain(cliMessages.vi.permissionFull)
  expect(permissions.command('/permistion')).toContain(cliMessages.vi.permissionFull)
  expect(permissions.fullAccess).toBe(true)
  expect(permissions.command('/permistion ask')).toContain(cliMessages.vi.permissionAsk)
  expect(permissions.fullAccess).toBe(false)
})

it('accepts the spelling alias and rejects invalid modes without changing permissions', () => {
  const permissions = new Permissions(cliMessages.en)
  permissions.command('/permission on')
  expect(permissions.fullAccess).toBe(true)
  expect(permissions.command('/permistion off extra')).toBe(cliMessages.en.permissionUsage)
  expect(permissions.command('/permission wrong')).toBe(cliMessages.en.permissionUsage)
  expect(permissions.fullAccess).toBe(true)
  permissions.command('/permission off')
  expect(permissions.fullAccess).toBe(false)
  expect(permissions.command('Please use /permistion full')).toBeUndefined()
  expect(new Permissions(cliMessages.en).fullAccess).toBe(false)
})
