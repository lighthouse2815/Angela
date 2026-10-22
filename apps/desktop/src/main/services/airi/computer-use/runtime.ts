import type { AuvDaemon } from '@auv-js/sdk/node'

import type { ComputerUseResult, ComputerUseWindowResult } from '../../../../shared/eventa/computer-use'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

import { AuvDaemonStartError, startAuv } from '@auv-js/sdk/node'

import * as v from 'valibot'

const execFileAsync = promisify(execFile)
const windowIdSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER))
const windowSchema = v.object({ id: windowIdSchema, title: v.nullable(v.string()), app_id: v.nullable(v.string()), is_focused: v.boolean() })
const inputSchema = v.object({ argv: v.pipe(v.array(v.pipe(v.string(), v.maxLength(16384), v.check(value => !value.includes('\0')))), v.minLength(2), v.maxLength(128)), windowId: v.nullish(windowIdSchema) })

/** Owns one private daemon and serializes desktop operations across renderer windows. */
export function createComputerUseRuntime(options: { binaryPath: string, storeRoot: string, windowBackend?: 'niri', clipboard?: { availableFormats: () => string[] | Promise<string[]>, readText: () => string | Promise<string>, writeText: (text: string) => void | Promise<void>, clear: () => void | Promise<void> } }) {
  let daemon: AuvDaemon | undefined
  let socketDirectory: string | undefined
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  const abort = new AbortController()

  async function connect() {
    if (daemon)
      return daemon

    await cleanupSocket()
    let listener: string
    if (process.platform === 'win32') {
      listener = `npipe://./pipe/airi-auv-${randomUUID()}`
    }
    else {
      // Keep the socket separate from the long Electron user-data path.
      socketDirectory = await mkdtemp(join(await realpath(tmpdir()), 'auv-'))
      await chmod(socketDirectory, 0o700)
      listener = `unix://${join(socketDirectory, 's')}`
    }

    try {
      const started = await startAuv({
        binaryPath: options.binaryPath,
        storeRoot: options.storeRoot,
        listeners: [listener],
        noDiscovery: true,
        signal: abort.signal,
      })
      daemon = started
      void started.exited.then(() => {
        if (daemon === started)
          daemon = undefined
      })
      return started
    }
    catch (error) {
      await cleanupSocket()
      // Electron serializes the message but drops the SDK's separate startup output.
      if (error instanceof AuvDaemonStartError && error.output.trim())
        throw new Error(`${error.message}\n${error.output.trim()}`, { cause: error })
      throw error
    }
  }

  async function cleanupSocket() {
    if (socketDirectory) {
      await rm(socketDirectory, { recursive: true, force: true })
      socketDirectory = undefined
    }
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(() => {
      if (disposed)
        throw new Error('Computer use has stopped.')
      return operation()
    })
    // A failed command must not prevent later commands from running.
    queue = next.then(() => undefined, () => undefined)
    return next
  }

  async function run(input: unknown): Promise<ComputerUseResult> {
    const { argv, windowId } = v.parse(inputSchema, input)
    if (argv[0] !== 'invoke' || !/^(?:--help|-h|help|(?:app|display|screen|window|input|mediaControl)\.[a-zA-Z]+)$/.test(argv[1]))
      throw new Error('Use invoke with a desktop command or --help.')

    // The host owns routing and artifact storage. CLI global flags must not replace them.
    const managedFlags = ['--store-root', '--endpoint', '--device', '--device-id', '--run', '--config', '--profile', '--discovery-file', '--pairing-store']
    if (argv.some(arg => managedFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`))))
      throw new Error('Computer use routing and storage are managed by Angela.')

    if (windowId != null && argv[1].startsWith('input.') && argv.some(arg => arg === '--target' || arg.startsWith('--target=')))
      throw new Error('Do not combine a Niri windowId with an AUV target. Use foreground input after selecting the native window.')
    return enqueue(() => execute(argv, windowId))
  }

  async function execute(argv: string[], windowId?: number | null): Promise<ComputerUseResult> {
    const active = await connect()
    if (windowId != null && argv[1].startsWith('input.'))
      await requireFocusedWindow(windowId)
    const command = [...argv]
    if (!command.includes('--json') && !command.includes('--help') && !command.includes('-h') && command[1] !== 'help')
      command.push('--json')
    command.push('--store-root', options.storeRoot)
    let stdout: string
    let stderr: string
    let exitCode = 0
    try {
      ({ stdout, stderr } = await execFileAsync(options.binaryPath, command, {
        env: { ...process.env, AUV_ENDPOINT: active.connectionOptions.endpoint, AUV_CONTEXT: undefined },
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        signal: abort.signal,
      }))
    }
    catch (error) {
      // Nonzero exits carry AUV's failure_details. Spawn failures and timeouts throw.
      if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'number'
        || ('killed' in error && error.killed) || !('stdout' in error) || typeof error.stdout !== 'string'
        || !('stderr' in error) || typeof error.stderr !== 'string') {
        throw error
      }
      exitCode = error.code
      stdout = error.stdout
      stderr = error.stderr
    }
    let output: unknown = stdout.trim()
    try {
      output = JSON.parse(stdout)
    }
    catch {
      // Help output is text. Keep it intact for command discovery.
    }
    return { argv, exitCode, output, stderr }
  }

  /** Pastes into the focused control. Input delivery does not verify the resulting control value. */
  async function pasteText(input: unknown): Promise<ComputerUseResult> {
    const { text, windowId } = v.parse(v.object({ text: v.pipe(v.string(), v.minLength(1), v.maxLength(16384), v.check(value => !value.includes('\0'))), windowId: v.nullish(windowIdSchema) }), input)
    const clipboard = options.clipboard
    if (!clipboard)
      return run({ argv: ['invoke', 'input.pasteText', text], windowId })

    return enqueue(async () => {
      if (windowId != null)
        await requireFocusedWindow(windowId)
      // The host clipboard adapter avoids the RemoteDesktop portal on Linux uinput.
      // Refuse rich clipboard data because a text snapshot cannot restore it.
      const formats = await clipboard.availableFormats()
      if (formats.some(format => !/^text\/plain(?:;charset=utf-8)?$/i.test(format)))
        throw new Error('Clipboard contains non-text data. Copy plain text before pasting with computer use.')
      const previous = await clipboard.readText()
      let restored = false
      let result: ComputerUseResult
      try {
        await clipboard.writeText(text)
        result = await execute(['invoke', 'input.key', 'ctrl+v'], windowId)
        // The receiving process reads the clipboard asynchronously after the key event.
        await setTimeout(250, undefined, { signal: abort.signal })
      }
      finally {
        // A user copy during delivery takes precedence over the previous snapshot.
        if (await clipboard.readText() === text && (await clipboard.availableFormats()).every(format => /^text\/plain(?:;charset=utf-8)?$/i.test(format))) {
          if (formats.length)
            await clipboard.writeText(previous)
          else
            await clipboard.clear()
          restored = true
        }
      }
      return { ...result, output: { keyboard: result.output, clipboardRestored: restored, verified: false } }
    })
  }

  async function niri(args: string[]): Promise<unknown> {
    if (options.windowBackend !== 'niri')
      throw new Error('Native window selection currently requires Linux Niri. Use AUV window discovery on other desktops.')
    const { stdout } = await execFileAsync('niri', ['msg', '--json', ...args], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      signal: abort.signal,
      windowsHide: true,
    })
    // Niri actions acknowledge success through exit status and emit no JSON.
    if (args[0] === 'action')
      return undefined
    return JSON.parse(stdout)
  }

  async function requireFocusedWindow(id: number) {
    const focused = v.parse(v.nullable(windowSchema), await niri(['focused-window']))
    if (focused?.id !== id || !focused.is_focused)
      throw new Error('The requested Niri window is no longer focused. Inspect windows and focus the intended ID before retrying.')
  }

  /** Lists compositor windows or focuses one exact native ID. Calls share the desktop input queue. */
  async function windows(input: unknown): Promise<ComputerUseWindowResult> {
    const request = v.parse(v.variant('action', [
      v.object({ action: v.literal('list'), title: v.nullish(v.pipe(v.string(), v.minLength(1), v.maxLength(256))) }),
      v.object({ action: v.literal('focus'), id: windowIdSchema }),
    ]), input)
    return enqueue(async () => {
      const entries = v.parse(v.array(windowSchema), await niri(['windows']))
      if (request.action === 'focus') {
        if (!entries.some(entry => entry.id === request.id))
          throw new Error('The requested Niri window does not exist. List windows again.')
        await niri(['action', 'focus-window', '--id', String(request.id)])
        // The compositor acknowledges the action before every client receives focus.
        await requireFocusedWindow(request.id)
        return { backend: 'niri', windows: entries.filter(entry => entry.id === request.id).map(entry => ({ id: entry.id, title: (entry.title ?? '').slice(0, 1000), appId: entry.app_id ?? '', focused: true })) }
      }
      return {
        backend: 'niri',
        windows: entries.filter(entry => !request.title || entry.title?.includes(request.title)).slice(0, 200).map(entry => ({ id: entry.id, title: (entry.title ?? '').slice(0, 1000), appId: entry.app_id ?? '', focused: entry.is_focused })),
      }
    })
  }

  async function readImage(input: unknown): Promise<string> {
    const { path } = v.parse(v.object({ path: v.string() }), input)
    return enqueue(async () => {
      const root = await realpath(options.storeRoot)
      const target = await realpath(path)
      const within = relative(root, target)
      if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`))
        throw new Error('Only screenshots from this Angela computer-use store can be read.')
      const info = await stat(target)
      if (!info.isFile() || info.size > 8 * 1024 * 1024)
        throw new Error('Screenshot must be a file smaller than 8 MiB.')
      const data = await readFile(target)
      const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255
      if (!png && !jpeg)
        throw new Error('Screenshot must be PNG or JPEG.')
      return `data:image/${png ? 'png' : 'jpeg'};base64,${data.toString('base64')}`
    })
  }

  /** Rejects queued calls, aborts active work, and waits for the owned daemon to exit. */
  async function dispose() {
    disposed = true
    abort.abort()
    await queue
    try {
      await daemon?.stop()
    }
    finally {
      await cleanupSocket()
    }
  }

  return { run, pasteText, windows, readImage, dispose }
}
