import type { cliMessages } from '@angela/i18n/cli'

/** Session-only approval mode. Only terminal commands can change it, never model output or restored history. */
export class Permissions {
  fullAccess = false

  constructor(private readonly messages: typeof cliMessages.en) {}

  /** Returns a local command response. Other input continues to the model. */
  command(text: string): string | undefined {
    const [name, mode, ...extra] = text.trim().split(/\s+/)
    if (name !== '/permistion' && name !== '/permission')
      return undefined
    if (extra.length || (mode !== undefined && !['full', 'ask', 'on', 'off'].includes(mode)))
      return this.messages.permissionUsage
    if (mode !== undefined)
      this.fullAccess = mode === 'full' || mode === 'on'
    return `${this.fullAccess ? this.messages.permissionFull : this.messages.permissionAsk}\n${this.messages.permissionUsage}`
  }
}
