import { defineInvokeEventa } from '@moeru/eventa'

/** AUV invocation result. A zero exit code does not verify the requested UI effect. */
export interface ComputerUseResult {
  argv: string[]
  exitCode: number
  output: unknown
  stderr: string
}

export const computerUseRun = defineInvokeEventa<ComputerUseResult, { argv: string[], windowId?: number | null }>('eventa:invoke:computer-use:run')
export const computerUseReadImage = defineInvokeEventa<string, { path: string }>('eventa:invoke:computer-use:read-image')

export const computerUsePasteText = defineInvokeEventa<ComputerUseResult, { text: string, windowId?: number | null }>('eventa:invoke:computer-use:paste-text')

/** Native compositor IDs are separate from AUV accessibility window IDs. */
export type ComputerUseWindowInput = { action: 'list', title?: string | null } | { action: 'focus', id: number }

/** A compositor snapshot. Focus does not verify the contents of the selected application. */
export interface ComputerUseWindowResult {
  backend: 'niri'
  windows: { id: number, title: string, appId: string, focused: boolean }[]
}

export const computerUseWindows = defineInvokeEventa<ComputerUseWindowResult, ComputerUseWindowInput>('eventa:invoke:computer-use:windows')
