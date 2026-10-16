import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'
import { LocalConfigFile } from '@proj-airi/local-config/node'
import { BrowserWindow } from 'electron'

import { localConfigRead, localConfigUpdate } from '../../../shared/eventa/local-config'
import { isLocalAppURL } from '../../libs/electron/url'

/** One main-process owner serves the shared file to trusted application renderers. */
export function setupLocalProviderConfig(context: ReturnType<typeof createContext>['context']) {
  const store = new LocalConfigFile()
  function authorize(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent | undefined) {
    if (!event || !BrowserWindow.fromWebContents(event.sender) || !isLocalAppURL(event.sender.getURL()))
      throw new Error('Local configuration requires an application window')
    if (event.senderFrame && event.senderFrame !== event.sender.mainFrame)
      throw new Error('Local configuration requires the main application frame')
  }
  defineInvokeHandler(context, localConfigRead, async (_, options) => {
    authorize(options?.raw?.ipcMainEvent)
    return store.read()
  })
  defineInvokeHandler(context, localConfigUpdate, async (patch, options) => {
    authorize(options?.raw?.ipcMainEvent)
    return store.update(patch)
  })
}
