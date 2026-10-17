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

/** PDF page numbers are one-based physical pages, independent of printed page labels. */
export interface StudyWorkspaceReadRequest {
  path: string
  /** @default 1 */
  startPage?: number
  /** @default The smaller of startPage + 9 and the document page count. */
  endPage?: number
}

/** Text files keep their original response. PDF responses contain only the requested pages. */
export type StudyWorkspaceDocument = { path: string, text: string } | {
  path: string
  totalPages: number
  pages: { page: number, text: string }[]
  truncated: boolean
}

/** Search scopes stay inside the selected directory. Page continuation applies only to a single PDF. */
export interface StudyWorkspaceSearchRequest {
  path: string
  query: string
  /** @default 1 */
  startPage?: number
}

/** Matches contain excerpts, not complete documents. Pending scopes and skipped files make incomplete searches explicit. */
export interface StudyWorkspaceSearchResult {
  path: string
  query: string
  matches: { path: string, excerpt: string, page?: number, line?: number }[]
  searchedFiles: number
  searchedPages: number
  truncated: boolean
  /** At most 20 scopes to search next with the same query. This list can also be incomplete. */
  pending: { path: string, startPage?: number }[]
  skipped: { path: string, reason: string }[]
}

/** Sources refer to documents and PDF pages read during the current folder selection. */
export interface StudyWorkspaceNoteRequest {
  filename: string
  content: string
  /** @default [] */
  sources?: { path: string, page?: number }[]
}

export const studyWorkspaceDirectory = defineInvokeEventa<StudyWorkspaceStatus, { action: 'choose' | 'status' | 'clear' }>('eventa:invoke:study-workspace:directory')
export const studyWorkspaceList = defineInvokeEventa<StudyWorkspaceListing, { path: string }>('eventa:invoke:study-workspace:list')
export const studyWorkspaceRead = defineInvokeEventa<StudyWorkspaceDocument, StudyWorkspaceReadRequest>('eventa:invoke:study-workspace:read')
export const studyWorkspaceSearch = defineInvokeEventa<StudyWorkspaceSearchResult, StudyWorkspaceSearchRequest>('eventa:invoke:study-workspace:search')
export const studyWorkspaceSaveNote = defineInvokeEventa<{ path: string, bytes: number }, StudyWorkspaceNoteRequest>('eventa:invoke:study-workspace:save-note')
