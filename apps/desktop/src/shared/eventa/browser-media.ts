import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

/** Only the user-authorized current tab can supply this snapshot. No page text, credentials, or browser history crosses this contract. */
export interface BrowserMediaPayload {
  url: string
  title: string
  currentTime: number | null
  duration: number | null
  paused?: boolean
}

/** Desktop requests a fresh snapshot. Null means no authorized active media tab. */
export const extensionReadMedia = defineInvokeEventa<BrowserMediaPayload | null>('eventa:invoke:study-along:extension-media')
export const extensionHeartbeat = defineEventa<void>('eventa:study-along:extension-heartbeat')

/** Pairing credentials are capability-scoped and are never included in chat context or diagnostics. */
export interface BrowserPairing { url: string, token: string, extensionId: string }
export const studyBrowserPair = defineInvokeEventa<BrowserPairing, { extensionId: string }>('eventa:invoke:study-along:browser-pair')
export const studyBrowserRevoke = defineInvokeEventa<void>('eventa:invoke:study-along:browser-revoke')
