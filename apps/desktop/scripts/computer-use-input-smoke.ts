/**
 * Verifies native input against an isolated, fullscreen Electron control.
 * DOM access observes results. Only AUV supplies clicks, keystrokes, and the paste shortcut.
 *
 * Call stack:
 *
 * smoke:computer-use-input
 *   -> Electron fixture
 *     -> createComputerUseRuntime
 *       -> AUV private daemon -> OS input -> fixture DOM
 */
import { strict as assert } from 'node:assert'
import { constants } from 'node:fs'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { env, platform } from 'node:process'

import { binaryPath } from '@auv-js/cli/binary'
import { errorMessageFrom } from '@moeru/std'
import { app, BrowserWindow, clipboard, screen } from 'electron'

import { createComputerUseRuntime } from '../src/main/services/airi/computer-use/runtime'
import { waitFor } from './lib/remote-debug'

const reportDir = resolve(env.SMOKE_REPORT_DIR || join(import.meta.dirname, '../../../.cache', `computer-use-input-${Date.now()}`))
const expected = 'Xin chào, mình là Angela. Hôm nay học vòng lặp Python nhé!'
let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
let window: BrowserWindow | undefined
let profile: string | undefined
let exitCode = 0
let savedClipboard: { text: string, html: string } | undefined
const clipboardSentinel = 'angela-input-smoke-clipboard'

// This smoke temporarily uses plain text. Preserve supported rich content outside the production paste operation.
function restoreFixtureClipboard() {
  if (!savedClipboard)
    return
  if (clipboard.readText() === clipboardSentinel && clipboard.availableFormats().every(format => format === 'text/plain'))
    clipboard.write(savedClipboard)
  savedClipboard = undefined
}

// Cleanup owns the final exit, including asynchronous daemon and profile removal.
app.on('window-all-closed', () => {})

interface Snapshot {
  focused: boolean
  width: number
  height: number
  trustedClicks: number
  trustedInputs: number
  active: string
  value: string
}

async function snapshot(): Promise<Snapshot> {
  assert(window && !window.isDestroyed(), 'Fixture closed before verification.')
  return window.webContents.executeJavaScript(`({
    focused: document.hasFocus(), width: innerWidth, height: innerHeight,
    trustedClicks: window.trustedClicks, trustedInputs: window.trustedInputs,
    active: document.activeElement.id, value: document.querySelector('input').value
  })`)
}

async function invoke(argv: string[]) {
  assert(runtime)
  assert(window?.isFocused(), 'Fixture lost focus before native input.')
  const result = await runtime.run({ argv: ['invoke', ...argv] })
  assert.equal(result.exitCode, 0, JSON.stringify(result))
}

async function main() {
  assert.equal(platform, 'linux', 'This smoke currently verifies Linux Wayland with uinput.')
  assert.equal(env.AUV_LINUX_INPUT_BACKEND, 'uinput', 'Set AUV_LINUX_INPUT_BACKEND=uinput explicitly.')
  await access('/dev/uinput', constants.R_OK | constants.W_OK)
  const executable = env.AUV_BINARY_PATH?.trim() || binaryPath()
  assert(isAbsolute(executable), 'AUV_BINARY_PATH must be absolute.')
  profile = await mkdtemp(join(tmpdir(), 'angela-input-smoke-'))
  app.setPath('userData', profile)
  await app.whenReady()
  const displays = screen.getAllDisplays()
  assert.equal(displays.length, 1, 'AUV uinput pointer input requires one output.')
  assert.equal(displays[0].bounds.x, 0, 'The test output must start at x=0.')
  assert.equal(displays[0].bounds.y, 0, 'The test output must start at y=0.')
  runtime = createComputerUseRuntime({ binaryPath: executable, storeRoot: join(profile, 'auv'), clipboard })
  window = new BrowserWindow({ fullscreen: true, frame: false, title: 'Angela input verification', webPreferences: { sandbox: true } })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="vi"><meta charset="utf-8">
    <title>Angela input verification</title>
    <style>body{margin:0;background:#16202b;color:white;font:24px sans-serif}h1{text-align:center}
    button,input{position:absolute;left:25%;width:50%;height:80px;box-sizing:border-box;font:24px sans-serif}
    button{top:25%}input{top:50%}</style>
    <h1>Angela — kiểm thử chuột và bàn phím</h1>
    <button id="arm">Bấm để mở ô nhập</button><input id="text" disabled placeholder="Ô nhập thử nghiệm">
    <script>window.trustedClicks=0;window.trustedInputs=0;
    const field=document.querySelector('input');
    document.querySelector('button').onclick=event=>{if(event.isTrusted){window.trustedClicks++;field.disabled=false}};
    field.onpointerdown=event=>{if(event.isTrusted)window.trustedClicks++};
    field.oninput=event=>{if(event.isTrusted)window.trustedInputs++};</script></html>`)}`)
  window.show()
  window.focus()
  const initial = await waitFor('fullscreen fixture focus', async () => {
    const state = await snapshot()
    return state.focused && state.width === displays[0].bounds.width && state.height === displays[0].bounds.height ? state : undefined
  }, 10000, 100)
  const x = String(initial.width / 2)
  await invoke(['input.clickPoint', x, String(initial.height / 4 + 40)])
  await waitFor('trusted button click', async () => (await snapshot()).trustedClicks === 1 ? true : undefined, 5000, 100)
  await invoke(['input.clickPoint', x, String(initial.height / 2 + 40)])
  await waitFor('input focus from native click', async () => {
    const state = await snapshot()
    return state.active === 'text' && state.trustedClicks === 2 ? true : undefined
  }, 5000, 100)
  assert((await snapshot()).focused, 'Fixture lost focus before typing.')
  await invoke(['input.typeText', 'angela-ascii-check'])
  await waitFor('literal ASCII input', async () => (await snapshot()).value === 'angela-ascii-check' ? true : undefined, 5000, 100)
  await invoke(['input.key', 'ctrl+a'])
  const formats = clipboard.availableFormats()
  assert(formats.every(format => ['text/plain', 'text/html'].includes(format)), 'The smoke preserves text and HTML. Copy plain text before testing other clipboard formats.')
  const previous = { text: clipboard.readText(), html: clipboard.readHTML() }
  savedClipboard = previous
  clipboard.writeText(clipboardSentinel)
  assert(window.isFocused(), 'Fixture lost focus before paste.')
  const paste = await runtime.pasteText({ text: expected })
  assert.equal(paste.exitCode, 0, JSON.stringify(paste))
  await waitFor('exact Vietnamese input', async () => (await snapshot()).value === expected ? true : undefined, 5000, 100)
  const final = await snapshot()
  assert(final.trustedInputs > 0, 'No trusted input events reached the control.')
  assert.equal(clipboard.readText(), clipboardSentinel, 'The previous clipboard text changed.')
  restoreFixtureClipboard()
  assert.equal(clipboard.readText(), previous.text, 'Original clipboard text did not return.')
  assert.equal(clipboard.readHTML(), previous.html, 'Original clipboard HTML did not return.')
  await writeFile(join(reportDir, 'fixture.png'), (await window.webContents.capturePage()).toPNG())
  await writeFile(join(reportDir, 'report.json'), JSON.stringify({
    ok: true,
    backend: 'uinput',
    trustedClicks: final.trustedClicks,
    asciiVerified: true,
    vietnameseVerified: final.value === expected,
    clipboardRestored: true,
    applicationEffectVerified: true,
    modelDriven: false,
  }, null, 2))
  console.info(`Native clicks, ASCII, Vietnamese, and clipboard restoration passed. Report: ${reportDir}`)
}

void mkdir(reportDir, { recursive: true }).then(main).catch(async (error) => {
  const message = errorMessageFrom(error) ?? String(error)
  await writeFile(join(reportDir, 'report.json'), JSON.stringify({ ok: false, error: message, clipboardFormats: app.isReady() ? clipboard.availableFormats() : [] }, null, 2))
  console.error(message)
  exitCode = 1
}).finally(async () => {
  await runtime?.dispose()
  restoreFixtureClipboard()
  window?.destroy()
  if (profile)
    await rm(profile, { recursive: true, force: true })
  app.exit(exitCode)
})
