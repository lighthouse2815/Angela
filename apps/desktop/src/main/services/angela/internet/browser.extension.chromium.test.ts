import type { TranscriptProvider } from '@angela/companion/internet'
import type { BrowserContext } from 'playwright'

import process from 'node:process'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from 'playwright'
import { expect, it, vi } from 'vitest'

import { ChromeExtensionBrowserProvider } from './browser/extension'
import { StudyAlongRuntime } from './runtime'

// Requires a full Chromium binary with the Extensions CDP domain, plus the built restricted extension.
it.skipIf(process.env.ANGELA_TEST_EXTENSION !== '1')('pairs the built extension, grants active-tab access, shares playback, stops sharing, and revokes pairing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-extension-chromium-'))
  const bridge = new ChromeExtensionBrowserProvider(join(directory, 'bridge'))
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(join(directory, 'profile'), {
      executablePath: process.env.ANGELA_TEST_CHROME_EXECUTABLE,
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      locale: 'en-US',
      args: ['--enable-unsafe-extension-debugging'],
    })
    const browser = context.browser()!
    const cdp = await browser.newBrowserCDPSession()
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve(import.meta.dirname, '../../../../../../../integrations/plugins/web-extension/.output-study-along/chrome-mv3') })
    const page = await context.newPage()
    await page.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Scoped services</title><video style="width:640px;height:360px"></video>' }))
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime = 1114)
    const pairing = await bridge.pair(id)
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${id}/popup.html`)
    await popup.locator('textarea').fill(JSON.stringify(pairing))
    await popup.getByRole('button', { name: 'Connect to Angela', exact: true }).click()
    await expect.poll(() => bridge.status().connected).toBe(true)
    await page.bringToFront()
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
    const tab = targetInfos.find(target => target.url === page.url())
    expect(tab).toBeDefined()
    await cdp.send('Extensions.triggerAction', { id, targetId: tab!.targetId })
    // Keep the lesson tab active while its actual extension UI requests sharing.
    await popup.getByRole('button', { name: 'Share this video tab', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(async () => (await bridge.getActiveMediaContext()).currentTime).toBe(1114)
    const getTranscript = vi.fn<TranscriptProvider['getTranscript']>(async () => ({ version: 1, videoId: 'dQw4w9WgXcQ', title: 'Scoped services', duration: 2000, language: 'en', source: 'official', generatedAt: Date.now(), segments: [{ start: 1100, end: 1110, text: 'One instance per request.' }] }))
    const runtime = new StudyAlongRuntime({ getTranscript }, join(directory, 'cache'), bridge, async () => ({ summarize: async () => 'One instance per request.' }))
    expect(await runtime.execute({ action: 'recent' })).toMatchObject({ video: { currentTime: 1114 }, recentSegments: [{ text: 'One instance per request.' }] })
    expect(await runtime.execute({ action: 'summarize-recent' })).toMatchObject({ summary: 'One instance per request.' })
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime = 1120)
    expect(await runtime.execute({ action: 'around' })).toMatchObject({ video: { currentTime: 1120 } })
    await popup.getByRole('button', { name: 'Stop sharing', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(async () => bridge.getActiveMediaContext().then(() => false, () => true)).toBe(true)
    await expect(runtime.execute({ action: 'around' })).rejects.toThrow()
    expect(getTranscript).toHaveBeenCalledOnce()
    await popup.getByRole('button', { name: 'Share this video tab', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(async () => (await bridge.getActiveMediaContext()).currentTime).toBe(1120)
    await page.close()
    await expect.poll(async () => bridge.getActiveMediaContext().then(() => false, () => true)).toBe(true)
    await cdp.send('Extensions.uninstall', { id })
    await expect.poll(() => bridge.status().connected).toBe(false)
    await expect(runtime.execute({ action: 'around' })).rejects.toThrow('not connected')
    await bridge.revoke()
    expect(bridge.status()).toMatchObject({ connected: false, paired: false })
    await runtime.whenIdle()
  }
  finally {
    await context?.close()
    await bridge.stop()
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
