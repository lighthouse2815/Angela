import type { Credentials } from 'zca-js'

import type { AwayLog, ExternalMessage } from '../../away/away-types'

/** Secret session material never enters normalized messages, logs, or model input. */
export interface ZaloCredentials {
  accountId: string
  session: Credentials
}

export interface ZaloCredentialStore {
  load: () => Promise<ZaloCredentials | null>
  save: (credentials: ZaloCredentials) => Promise<void>
  clear: () => Promise<void>
}

/** Login display owns temporary QR material and removes it after authentication or failure. */
export interface ZaloLoginDisplay {
  show: (image: string) => Promise<void>
  clearQr: () => Promise<void>
}

/** The transport boundary exposes only inbound text DMs and replies to their conversation. */
export interface ZaloClient {
  connect: (receive: (message: ExternalMessage) => void, log: AwayLog, disconnected: () => void, signal: AbortSignal) => Promise<string>
  send: (conversationId: string, text: string) => Promise<string>
  disconnect: () => Promise<void>
}
