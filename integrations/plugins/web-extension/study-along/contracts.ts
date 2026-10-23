import { defineInvokeEventa } from '@moeru/eventa'

export { extensionHeartbeat, extensionReadMedia } from '../../../../apps/desktop/src/shared/eventa/browser-media'
export type { BrowserMediaPayload, BrowserPairing } from '../../../../apps/desktop/src/shared/eventa/browser-media'

/** Popup commands never accept page scripts or a caller-supplied tab identifier. */
export const studyExtensionStatus = defineInvokeEventa<{ connected: boolean, sharing: boolean, needsPairing: boolean }>('eventa:invoke:study-along:extension-status')
export const studyExtensionConnect = defineInvokeEventa<void, { pairing: string }>('eventa:invoke:study-along:extension-connect')
export const studyExtensionShare = defineInvokeEventa<void, { enabled: boolean }>('eventa:invoke:study-along:extension-share')
