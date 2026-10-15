import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow, dialog } from 'electron'
import { object, parse, picklist } from 'valibot'

import { studyWorkspaceDirectory, studyWorkspaceList, studyWorkspaceRead, studyWorkspaceSaveNote } from '../../../../shared/eventa/study-workspace'
import { StudyWorkspace } from './runtime'

/** Registers one session-owned workspace for all desktop chat windows. Only the native picker can grant folder access. */
export function setupStudyWorkspace(context: ReturnType<typeof createContext>['context']) {
  const workspace = new StudyWorkspace()
  let choosing = false
  let selectionVersion = 0

  defineInvokeHandler(context, studyWorkspaceDirectory, async (input, options) => {
    const { action } = parse(object({ action: picklist(['choose', 'status', 'clear']) }), input)
    if (action === 'status')
      return workspace.status()
    if (action === 'clear') {
      selectionVersion++
      return workspace.clear()
    }
    if (choosing)
      throw new Error('A learning directory picker is already open.')
    const event = options?.raw?.ipcMainEvent
    const owner = event ? BrowserWindow.fromWebContents(event.sender) : null
    if (!owner || owner.isDestroyed())
      throw new Error('The desktop chat window is no longer available.')
    const version = ++selectionVersion
    choosing = true
    try {
      const selection = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
      if (selection.canceled || !selection.filePaths[0])
        return { ...workspace.status(), cancelled: true }
      if (owner.isDestroyed() || version !== selectionVersion)
        throw new Error('The folder selection expired. Choose the learning directory again.')
      return await workspace.select(selection.filePaths[0])
    }
    finally {
      choosing = false
    }
  })
  defineInvokeHandler(context, studyWorkspaceList, input => workspace.list(input))
  defineInvokeHandler(context, studyWorkspaceRead, input => workspace.read(input))
  defineInvokeHandler(context, studyWorkspaceSaveNote, input => workspace.saveNote(input))
}
