import type { ElectronMcpCallToolResult } from '../../../../shared/eventa'

import { describe, expect, it, vi } from 'vitest'

import { McpBrowserContextProvider } from './browser'

const page = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1114', title: 'AddScoped lesson', currentTime: 1114, duration: 2000, description: 'Dependency injection' }

function result(input: unknown = page): ElectronMcpCallToolResult {
  return { content: [{ type: 'text', text: `### Result\n${JSON.stringify(input, null, 2)}\n### Ran Playwright code\nawait page.evaluate(...)` }] }
}

describe('connected browser context', () => {
  it('maps current playback at 18:34 and removes URL tracking material', async () => {
    const callTool = vi.fn(async () => result())
    const provider = new McpBrowserContextProvider({ callTool })
    expect(await provider.getActiveMediaContext()).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      title: 'AddScoped lesson',
      currentTime: 1114,
      duration: 2000,
      platform: 'youtube',
    })
    expect(callTool).toHaveBeenCalledWith({ name: 'angela-browser::browser_evaluate', arguments: { function: expect.stringContaining('video.currentTime') } })
    expect(await provider.getActiveTab()).toEqual({ url: page.url, title: page.title })
  })

  it('keeps unknown playback positions unknown', async () => {
    const callTool = vi.fn(async () => result({ ...page, currentTime: null, duration: null }))
    expect((await new McpBrowserContextProvider({ callTool }).getActiveMediaContext()).currentTime).toBeNull()
  })

  it('does not trust code blocks or snapshot text as playback evidence', async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: `### Snapshot\n${JSON.stringify(page)}` }] }))
    await expect(new McpBrowserContextProvider({ callTool }).getActiveMediaContext()).rejects.toThrow('no media context')
  })

  it.each([
    { ...page, currentTime: -1 },
    { ...page, currentTime: '1114' },
    { ...page, url: 'https://evil.test/watch?v=dQw4w9WgXcQ' },
  ])('rejects invalid or unsupported browser evidence', async (input) => {
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: `### Result\n${JSON.stringify(input)}` }] }))
    await expect(new McpBrowserContextProvider({ callTool }).getActiveMediaContext()).rejects.toThrow()
  })

  it('fails closed on a browser tool error', async () => {
    const callTool = vi.fn(async () => ({ ...result(), isError: true }))
    await expect(new McpBrowserContextProvider({ callTool }).getActiveMediaContext()).rejects.toThrow('could not observe')
  })
})
