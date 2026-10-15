import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { rawTool } from '@xsai/tool'

import { computerUsePasteText, computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'

/** Creates desktop-only tools. IPC clients are local to the elected renderer executor. */
export async function computerUseTools(): Promise<Tool[]> {
  let invokers: ReturnType<typeof createInvokers> | undefined
  function createInvokers() {
    const { context } = createContext(window.electron.ipcRenderer)
    return {
      run: defineInvoke(context, computerUseRun),
      pasteText: defineInvoke(context, computerUsePasteText),
      readImage: defineInvoke(context, computerUseReadImage),
    }
  }
  function client() {
    invokers ??= createInvokers()
    return invokers
  }
  return [
    rawTool({
      name: 'computer_use',
      description: 'Control native desktop apps, inspect windows, capture screenshots, and use keyboard or mouse input. On macOS, call app.probePermissions before visual tasks. If screen_recording is missing, ask the user to grant permission; captures can contain only a blank background. Start with argv ["invoke", "--help"], then inspect command help. Pass each CLI argument separately. Use explicit window targets when available. For Vietnamese or Unicode text, use computer_use_paste_text after focusing the input. Preserve failure_details and verified metadata: exitCode 0 does not prove the intended UI effect. Use computer_use_read_image to view screenshot artifact paths. This tool acts on the local computer.',
      parameters: {
        type: 'object',
        properties: {
          argv: { type: 'array', items: { type: 'string' }, description: 'AUV arguments beginning with invoke, excluding the executable name.' },
        },
        required: ['argv'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const result = await client().run(input as { argv: string[] })
        if (result.exitCode !== 0)
          throw new Error(JSON.stringify(result))
        return JSON.stringify(result)
      },
    }),
    rawTool({
      name: 'computer_use_paste_text',
      description: 'Paste literal text, including Vietnamese, into the currently focused desktop control. Focus the intended input first. On Linux uinput, uses Electron clipboard and Ctrl+V without the RemoteDesktop portal. Refuses non-text clipboard formats. Restores the prior text unless the user copies something during delivery. Other backends use AUV input.pasteText. Delivery does not prove the control received the text. Inspect the resulting UI before claiming success.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', minLength: 1, maxLength: 16384, description: 'Literal text to paste into the focused control.' } },
        required: ['text'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const result = await client().pasteText(input as { text: string })
        if (result.exitCode !== 0)
          throw new Error(JSON.stringify(result))
        return JSON.stringify(result)
      },
    }),
    rawTool({
      name: 'computer_use_read_image',
      description: 'View a PNG or JPEG screenshot artifact produced by computer_use. Only files inside AIRI computer-use storage can be read. Select this tool together with computer_use for visual tasks.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute screenshot artifact path returned by computer_use.' } },
        required: ['path'],
        additionalProperties: false,
      },
      execute: async input => [{ type: 'image_url', image_url: { url: await client().readImage(input as { path: string }) } }],
    }),
  ]
}
