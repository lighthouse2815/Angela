import type { BrowserContextProvider, VideoContext } from '@angela/companion/internet'

import type { McpManager } from '../mcp-servers'

import { InternetError, parseYouTubeUrl } from '@angela/companion/internet'
import { secondsSchema } from '@angela/companion/internet/contracts'

import * as v from 'valibot'

import { browserServerName } from '../../../../shared/browser-mcp'

const pageSchema = v.object({
  url: v.pipe(v.string(), v.maxLength(4096)),
  title: v.pipe(v.string(), v.maxLength(1000)),
  currentTime: v.nullable(secondsSchema),
  duration: v.nullable(secondsSchema),
  description: v.pipe(v.string(), v.maxLength(1000)),
})

/**
 * Observes the current tab through Angela's existing Playwright MCP session.
 * The fixed script never navigates, reads browser storage, or forwards cookies to another process.
 */
export class McpBrowserContextProvider implements BrowserContextProvider {
  constructor(private readonly mcp: Pick<McpManager, 'callTool'>) {}

  private async observe() {
    const result = await this.mcp.callTool({
      name: `${browserServerName}::browser_evaluate`,
      arguments: { function: `() => {
        const videos = [...document.querySelectorAll('video')].filter(video => {
          const box = video.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        })
        const video = videos.find(video => !video.paused && !video.ended) || videos[0]
        return {
          url: location.href,
          title: document.title.slice(0, 1000),
          currentTime: video && Number.isFinite(video.currentTime) ? video.currentTime : null,
          duration: video && Number.isFinite(video.duration) ? video.duration : null,
          description: (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').slice(0, 1000)
        }
      }` },
    })
    if (result.isError)
      throw new InternetError('UNAVAILABLE', 'Angela Browser could not observe the current lesson tab.')
    // Playwright MCP renders evaluation results as JSON under its Result heading.
    // Snapshot text and executed JavaScript are separate sections and never enter the evidence parser.
    for (const content of result.content ?? []) {
      if (content.type !== 'text' || typeof content.text !== 'string' || content.text.length > 32000)
        continue
      const json = /(?:^|\n)### Result\r?\n([\s\S]*?)(?:\r?\n### |$)/u.exec(content.text)?.[1]
      if (!json)
        continue
      try {
        return v.parse(pageSchema, JSON.parse(json.trim()))
      }
      catch {
        throw new InternetError('UNAVAILABLE', 'Angela Browser returned invalid media context.')
      }
    }
    throw new InternetError('UNAVAILABLE', 'Angela Browser returned no media context. Connect the lesson tab first.')
  }

  async getActiveTab() {
    const page = await this.observe()
    return { url: page.url, title: page.title }
  }

  async getActiveMediaContext(): Promise<VideoContext> {
    const page = await this.observe()
    const video = parseYouTubeUrl(page.url)
    return { ...video, title: page.title, currentTime: page.currentTime, duration: page.duration }
  }
}
