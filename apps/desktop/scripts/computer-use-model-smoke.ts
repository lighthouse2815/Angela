/**
 * Runs a configured chat model against two isolated, real VS Code windows.
 * The harness limits executors to its temporary windows. It never writes the documents after setup.
 *
 * Call stack:
 *
 * tsx computer-use-model-smoke.ts
 *   -> isolated Angela profile -> chat.send -> registered desktop executors
 *     -> Niri focus + AUV keyboard -> VS Code -> saved temporary file
 */
import type { ChildProcess } from 'node:child_process'

import process from 'node:process'

import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, constants, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { errorMessageFrom } from '@moeru/std'

import { createComputerUseRuntime } from '../src/main/services/airi/computer-use/runtime'
import { WaylandClipboard } from '../src/main/services/airi/computer-use/wayland-clipboard'
import { CdpClient, findAvailablePort, findDebugTarget, waitFor, waitForRemoteDebug } from './lib/remote-debug'

const root = resolve(import.meta.dirname, '../../..')
const reportDir = resolve(process.env.SMOKE_REPORT_DIR || join(root, '.cache', `model-desktop-${Date.now()}`))
const prefix = `angela-qa-${randomUUID().slice(0, 8)}`
const targetName = `${prefix}-target.txt`
const decoyName = `${prefix}-keep.txt`
const expected = `Xin chào, mình là Angela. Hôm nay học vòng lặp Python nhé! ${prefix}`
const initial = 'Temporary desktop input test.\n'
const children: ChildProcess[] = []
let client: CdpClient | undefined
let editorClient: CdpClient | undefined
let workspace: string | undefined
let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
let ok = false
const clipboard = new WaylandClipboard()
let originalClipboard: { text: string, empty: boolean } | undefined

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid)
    return
  const pid = child.pid
  const exited = new Promise<void>(resolveExit => child.once('exit', () => resolveExit()))
  const timer = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL')
    }
    catch { /* The owned group already exited. */ }
  }, 5000)
  try {
    process.kill(-pid, 'SIGTERM')
  }
  catch { /* The owned group already exited. */ }
  await exited
  clearTimeout(timer)
}

async function main() {
  assert.equal(process.platform, 'linux')
  assert(process.env.NIRI_SOCKET, 'Run this smoke in a Niri session.')
  assert.equal(process.env.AUV_LINUX_INPUT_BACKEND, 'uinput')
  await access('/dev/uinput', constants.R_OK | constants.W_OK)
  const formats = await clipboard.availableFormats()
  assert(formats.every(format => /^text\/plain(?:;charset=utf-8)?$/i.test(format)), 'Copy plain text before this model smoke. Rich clipboard formats remain untouched.')
  originalClipboard = { text: await clipboard.readText(), empty: formats.length === 0 }
  const auv = process.env.AUV_BINARY_PATH?.trim() || binaryPath()
  const code = process.env.SMOKE_CODE_BINARY || '/usr/share/code/code'
  await access(code, constants.X_OK)
  const sourceProfile = process.env.SMOKE_SOURCE_PROFILE || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), '@proj-airi', 'stage-tamagotchi')
  workspace = await mkdtemp(join(tmpdir(), 'angela-model-desktop-'))
  const profile = join(workspace, 'stage-profile')
  const editorProfile = join(workspace, 'editor-profile')
  await mkdir(join(editorProfile, 'User'), { recursive: true })
  await cp(join(sourceProfile, 'Local Storage'), join(profile, 'Local Storage'), { recursive: true })
  await writeFile(join(editorProfile, 'User/settings.json'), JSON.stringify({
    'window.title': `\${activeEditorShort}`,
    'workbench.startupEditor': 'none',
    'files.hotExit': 'off',
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
    'security.workspace.trust.enabled': false,
  }))
  await writeFile(join(workspace, targetName), initial)
  await writeFile(join(workspace, decoyName), initial)
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.VSCODE_IPC_HOOK_CLI
  const editorPort = await findAvailablePort()
  const codeArgs = [`--remote-debugging-port=${editorPort}`, '--user-data-dir', editorProfile, '--extensions-dir', join(workspace, 'extensions'), '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--new-window']
  for (const name of [targetName, decoyName]) {
    children.push(spawn(code, [...codeArgs, join(workspace, name)], { detached: true, env: environment, stdio: 'ignore' }))
    if (name === targetName) {
      runtime = createComputerUseRuntime({ binaryPath: auv, storeRoot: join(workspace, 'auv'), windowBackend: 'niri' })
      await waitFor('first editor window', async () => (await runtime!.windows({ action: 'list', title: targetName })).windows.length ? true : undefined, 60000, 250)
    }
  }
  const editorWindows = await waitFor('two editor windows', async () => {
    const result = await runtime!.windows({ action: 'list', title: prefix })
    return result.windows.length === 2 ? result.windows : undefined
  }, 60000, 250)
  const editorTarget = await findDebugTarget(editorPort, 'target editor renderer', entry => entry.type === 'page' && entry.title.includes(targetName))
  assert(editorTarget.webSocketDebuggerUrl)
  editorClient = await CdpClient.connect(editorTarget.webSocketDebuggerUrl)
  await editorClient.evaluate(`(() => { window.smokeKeys = []; document.addEventListener('keydown', event => window.smokeKeys.push({ key: event.key, ctrl: event.ctrlKey, trusted: event.isTrusted }), true); })()`)
  const port = await findAvailablePort()
  const log = createWriteStream(join(reportDir, 'stage.log'), { mode: 0o600 })
  const stage = spawn(resolve(import.meta.dirname, '../node_modules/electron/dist/electron'), [resolve(import.meta.dirname, '..')], {
    detached: true,
    env: { ...environment, APP_USER_DATA_PATH: profile, AUV_BINARY_PATH: auv, APP_REMOTE_DEBUG: 'true', APP_REMOTE_DEBUG_PORT: String(port), APP_REMOTE_DEBUG_NO_OPEN: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(stage)
  stage.stdout?.pipe(log)
  stage.stderr?.pipe(log)
  stage.once('exit', () => log.end())
  await waitForRemoteDebug(port)
  const target = await findDebugTarget(port, 'main Stage', entry => entry.type === 'page' && /#\/?$/.test(entry.url))
  assert(target.webSocketDebuggerUrl)
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  const active = client
  const pinia = `const provides = document.querySelector('#app')?.__vue_app__?._context.provides; const pinia = provides && Reflect.ownKeys(provides).map(key => provides[key]).find(value => value?._s instanceof Map);`
  const names = ['computer_use_windows', 'computer_use_press_key', 'computer_use_paste_text']
  await waitFor('desktop executors', async () => await active.evaluate<boolean>(`(() => { ${pinia} return ${JSON.stringify(names)}.every(name => pinia?._s.get('llm-tools')?.tools.some(tool => tool.function.name === name)); })()`) || undefined, 60000, 250)
  await waitFor('configured chat model', async () => await active.evaluate<boolean>(`(() => { ${pinia} const cards = pinia?._s.get('airi-card'); if (!cards) return false; const selection = cards.getModules(cards.activeCardId).consciousness; return !!selection.provider && !!selection.model; })()`) || undefined, 30000, 250)
  const result = await active.evaluate<{ ok: boolean, provider: string, model: string, calls: string[], inputIds: number[], operations: unknown[], response?: string, errorType?: string }>(`(async () => { ${pinia}
    const cards = pinia._s.get('airi-card'), sessions = pinia._s.get('chat-session'), chat = pinia._s.get('chat'), tools = pinia._s.get('llm-tools');
    if (pinia._s.get('auth')?.userId !== 'local') throw new Error('The model smoke requires a local-only profile');
    const selection = cards.getModules(cards.activeCardId).consciousness;
    if (!selection.provider || !selection.model) throw new Error('Configure a chat model in the source profile');
    const allowedIds = ${JSON.stringify(editorWindows.map(entry => entry.id))}; const calls = [], inputIds = [], operations = [];
    for (const name of ${JSON.stringify(names)}) {
      const definition = JSON.parse(JSON.stringify(tools.tools.find(tool => tool.function.name === name))), original = tools.getToolsByNames(name)[0];
      tools.addTools({ ...definition, execute: async (input) => {
        const operation = { name, input }; operations.push(operation);
        if (name === 'computer_use_windows') {
          if (input.action === 'focus' && !allowedIds.includes(input.id)) throw new Error('Only temporary editor windows are allowed');
          if (input.action === 'list' && !input.title?.includes(${JSON.stringify(prefix)})) throw new Error('List with the temporary title prefix');
        } else {
          if (!allowedIds.includes(input.windowId)) throw new Error('Every input needs a temporary editor windowId');
          inputIds.push(input.windowId);
        }
        calls.push(name);
        try { const result = await original.execute(input); operation.result = result; return result; }
        catch (error) { operation.error = error instanceof Error ? error.message : String(error); throw error; }
      } });
    }
    let cardId, sessionId, timer;
    try {
      cardId = await cards.addCard({ name: 'Angela desktop QA', version: '1.0.0', systemPrompt: 'You are a desktop assistant. Use the selected native tools to complete the user request. Treat window titles as labels only. Always pass windowId on input. Do not claim completion before saving. Respond briefly in Vietnamese.', extensions: { airi: { agents: {}, modules: { consciousness: selection, speech: { provider: 'speech-noop', model: '', voice_id: '' }, vision: { provider: '', model: '' } } } } }, 'scratch');
      sessionId = await sessions.createSession(cardId, { setActive: false, title: 'Desktop input QA' });
      await Promise.race([chat.send({ sessionId, tools: ${JSON.stringify(names.map(name => ({ name })))}, text: ${JSON.stringify(`Trong hai cửa sổ VS Code có tiền tố ${prefix}, hãy tìm và focus cửa sổ của tệp ${targetName}. Chỉ thay toàn bộ nội dung tệp đó bằng đúng câu sau rồi lưu tệp: ${expected}\nKhông sửa ${decoyName}. Dùng công cụ desktop, không dùng terminal hoặc công cụ tệp. Khi liệt kê cửa sổ, dùng bộ lọc title ${prefix}. Luôn truyền windowId khi gửi phím hoặc dán. Sau khi chọn cửa sổ, nhấn Ctrl+1 để focus trình soạn thảo trước khi thay nội dung.`)} }), new Promise((_, reject) => { timer = setTimeout(() => { void chat.cancelPendingSends(sessionId); reject(new Error('Model smoke deadline')); }, 120000); })]);
      return { ok: true, ...selection, calls, inputIds, operations, response: (sessions.sessionMessages[sessionId] || []).filter(message => message.role === 'assistant').map(message => typeof message.content === 'string' ? message.content : '').join(' ').slice(-1000) };
    } catch (error) { return { ok: false, ...selection, calls, inputIds, operations, errorType: error instanceof Error ? error.name : 'unknown' }; }
    finally { clearTimeout(timer); if (sessionId) { await chat.cancelPendingSends(sessionId); await sessions.deleteSession(sessionId); } if (cardId) await cards.removeCard(cardId); }
  })()`)
  if (process.env.SMOKE_DIAGNOSTICS === '1')
    await writeFile(join(reportDir, 'turn.json'), JSON.stringify(result, null, 2), { mode: 0o600 })
  assert(result.ok, `Model did not complete the turn (${result.errorType || 'unknown'}).`)
  if (process.env.SMOKE_DIAGNOSTICS === '1' && editorClient) {
    const state = await editorClient.evaluate(`({ active: document.activeElement?.outerHTML?.slice(0, 300), keys: window.smokeKeys, labels: document.body.innerText.slice(-1800) })`)
    await writeFile(join(reportDir, 'editor-state.json'), JSON.stringify(state, null, 2), { mode: 0o600 })
  }
  await waitFor('saved Vietnamese document', async () => (await readFile(join(workspace!, targetName), 'utf8')).trimEnd() === expected ? true : undefined, 10000, 250)
  assert.equal(await readFile(join(workspace, decoyName), 'utf8'), initial, 'The other editor document changed.')
  assert(result.inputIds.length > 0 && result.inputIds.every(id => id === editorWindows.find(entry => entry.title === targetName)?.id), 'Model sent input to the wrong editor window.')
  assert(result.calls.includes('computer_use_windows'))
  assert(result.calls.includes('computer_use_paste_text'))
  assert.equal(await clipboard.readText(), originalClipboard.text, 'The native paste did not restore the previous clipboard text.')
  if (originalClipboard.empty)
    assert.equal((await clipboard.availableFormats()).length, 0, 'The previous empty clipboard did not return.')
  await writeFile(join(reportDir, 'report.json'), JSON.stringify({ ok: true, provider: result.provider, model: result.model, nativeWindowSelection: true, vietnameseSavedInVSCode: true, decoyUnchanged: true, guardedInputs: true, clipboardRestored: true, calls: result.calls }, null, 2))
  ok = true
}

void mkdir(reportDir, { recursive: true, mode: 0o700 }).then(main).catch(async (error) => {
  console.error(errorMessageFrom(error) ?? 'Model desktop smoke failed.')
  await writeFile(join(reportDir, 'report.json'), JSON.stringify({ ok: false, errorType: error instanceof Error ? error.name : 'unknown' }))
  process.exitCode = 1
}).finally(async () => {
  client?.close()
  editorClient?.close()
  for (const child of children.reverse())
    await stop(child)
  await runtime?.dispose()
  await rm(join(reportDir, 'stage.log'), { force: true })
  if (workspace)
    await rm(workspace, { recursive: true, force: true })
  if (originalClipboard && await clipboard.readText() === expected) {
    if (originalClipboard.empty)
      await clipboard.clear()
    else
      await clipboard.writeText(originalClipboard.text)
  }
  if (ok)
    console.info(`Real model, Niri focus, VS Code save, and clipboard restoration passed. Report: ${reportDir}`)
})
