import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow } from 'electron'

import { companionBegin, companionFinish, companionObserve, companionRecords, companionReminders, companionTasks, companionTool } from '../../../../shared/eventa/companion-runtime'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { isLocalAppURL } from '../../../libs/electron/url'
import { DesktopCompanionRuntime } from './runtime'

/** Every invoke authorizes the application main frame. Request IDs are additionally bound to the sending WebContents. */
export function setupCompanionRuntime(context: ReturnType<typeof createContext>['context']) {
  const host = new DesktopCompanionRuntime()
  const owners = new Set<number>()
  function authorize(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent | undefined) {
    if (!event || !BrowserWindow.fromWebContents(event.sender) || !isLocalAppURL(event.sender.getURL()) || (event.senderFrame && event.senderFrame !== event.sender.mainFrame))
      throw new Error('Companion runtime requires an application main frame')
    const id = event.sender.id
    if (!owners.has(id)) {
      owners.add(id)
      event.sender.once('destroyed', () => {
        owners.delete(id)
        void host.disconnect(id)
      })
    }
    return id
  }
  defineInvokeHandler(context, companionRecords, (input, options) => {
    authorize(options?.raw?.ipcMainEvent)
    return host.records(input.characterId, input.command)
  })
  defineInvokeHandler(context, companionTasks, (input, options) => {
    authorize(options?.raw?.ipcMainEvent)
    return host.tasks(input.characterId, input.command)
  })
  defineInvokeHandler(context, companionBegin, (input, options) => host.begin(authorize(options?.raw?.ipcMainEvent), input))
  defineInvokeHandler(context, companionTool, (input, options) => host.executeTool(authorize(options?.raw?.ipcMainEvent), input.requestId, input.name, input.input))
  defineInvokeHandler(context, companionObserve, (input, options) => host.observe(authorize(options?.raw?.ipcMainEvent), input.requestId, input.event))
  defineInvokeHandler(context, companionFinish, (input, options) => host.finish(authorize(options?.raw?.ipcMainEvent), input.requestId, input.cancelled, input.failed))
  defineInvokeHandler(context, companionReminders, (input, options) => host.reminders(authorize(options?.raw?.ipcMainEvent), input))
  onAppBeforeQuit(() => host.close())
}
