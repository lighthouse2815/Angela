import { defineInvokeEventa } from '@moeru/eventa'

/** The selected directory belongs to the current desktop session. Restarting clears access. */
export interface StudyWorkspaceStatus {
  directory: string | null
  cancelled: boolean
}

/** Paths are relative to the directory chosen through the native folder picker. */
export interface StudyWorkspaceListing {
  path: string
  entries: { name: string, kind: 'directory' | 'document' }[]
  truncated: boolean
}

export const studyWorkspaceDirectory = defineInvokeEventa<StudyWorkspaceStatus, { action: 'choose' | 'status' | 'clear' }>('eventa:invoke:study-workspace:directory')
export const studyWorkspaceList = defineInvokeEventa<StudyWorkspaceListing, { path: string }>('eventa:invoke:study-workspace:list')
export const studyWorkspaceRead = defineInvokeEventa<{ path: string, text: string }, { path: string }>('eventa:invoke:study-workspace:read')
export const studyWorkspaceSaveNote = defineInvokeEventa<{ path: string, bytes: number }, { filename: string, content: string }>('eventa:invoke:study-workspace:save-note')
