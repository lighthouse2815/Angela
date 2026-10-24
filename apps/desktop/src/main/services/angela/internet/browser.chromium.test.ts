import type { TranscriptProvider } from '@angela/companion/internet'
import type { Browser } from 'playwright'

import process from 'node:process'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { expect, it, vi } from 'vitest'

import { McpBrowserContextProvider } from './browser'
import { StudyAlongRuntime } from './runtime'

// Chromium runs the production observation script. HTTP and transcript fixtures isolate public-video availability.
it.skipIf(process.env.ANGELA_TEST_CHROME !== '1')('reads fresh playback from Chromium, summarizes the watched interval, and rejects a tab without media', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-chromium-lesson-'))
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Scoped services</title><video style="width:640px;height:360px"></video>' }))
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime = 1114)
    const context = new McpBrowserContextProvider({ callTool: async (request) => {
      const code = request.arguments?.function
      if (typeof code !== 'string')
        throw new Error('Expected the browser evaluation script')
      const result: unknown = await page.evaluate(`(${code})()`)
      return { content: [{ type: 'text', text: `### Result\n${JSON.stringify(result)}` }] }
    } })
    const provider: TranscriptProvider = { getTranscript: vi.fn<TranscriptProvider['getTranscript']>(async () => ({ version: 1, videoId: 'dQw4w9WgXcQ', title: 'Scoped services', language: 'en', source: 'official', duration: 2000, generatedAt: Date.now(), segments: [
      { start: 1100, end: 1110, text: 'One instance per request.' },
      { start: 1150, end: 1160, text: 'Future example.' },
    ] })) }
    const summarize = vi.fn(async (evidence: string) => {
      expect(evidence).toContain('One instance per request.')
      expect(evidence).not.toContain('Future example.')
      return 'Each request shares one instance.'
    })
    const runtime = new StudyAlongRuntime(provider, directory, context, async () => ({ summarize }))
    expect(await runtime.execute({ action: 'recent' })).toMatchObject({ video: { currentTime: 1114 }, recentSegments: [{ text: 'One instance per request.' }] })
    expect(await runtime.execute({ action: 'summarize-recent' })).toMatchObject({ summary: 'Each request shares one instance.' })
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime = 1160)
    expect(await runtime.execute({ action: 'around' })).toMatchObject({ video: { currentTime: 1160 } })
    expect(provider.getTranscript).toHaveBeenCalledOnce()
    await page.locator('video').evaluate(video => video.remove())
    await expect(runtime.execute({ action: 'around' })).rejects.toThrow('playback position')
    await runtime.whenIdle()
  }
  finally {
    await browser?.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
