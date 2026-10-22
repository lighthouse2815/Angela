import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it.skipIf(process.platform === 'win32').each<[string, string, string?]>([
  ['abcde', 'abcXde'],
  ['abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxXyz'],
  ['/tas', '/tXas'],
  ['/\u001B[B\t', '/tasksX'],
  ['/\u001B[A\t', '/task add <title>X'],
  ['/\u001B[B\u001B[B\u001B[A\t', '/tasksX'],
  ['/\u001B[B\u001B[B\u001B[B\t', '/helpX'],
  ['/tas\u001B[B\t', '/task add <title>X'],
  ['/\u001B[B\u001B[B\u007F/tas\t', '/tasksX'],
  ['/\u001B[B\r', '/tasksX'],
  ['/\u001B[B', '/tasksX', '\tX\n'],
  ['/tas\u001B[B', '/task add <title>X', '\tX\n'],
  ['\u001B[A', 'previousX'],
  ['/unknown\u0015\u001B[A', 'previousX'],
])('edits input and selects commands through a real terminal notification: %s', async (typed, expected, after = 'X\n') => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-terminal-'))
  directories.push(directory)
  const fixture = join(directory, 'terminal.mjs')
  const module = fileURLToPath(new URL('./terminal.ts', import.meta.url))
  await writeFile(fixture, `
import process from 'node:process'
import { Terminal } from ${JSON.stringify(module)}
const terminal = new Terminal(() => terminal.close())
process.once('SIGUSR1', () => terminal.notify('REMINDER_MARKER'))
process.stdin.on('keypress', ready)
await terminal.ask('HISTORY: ')
const result = await terminal.ask('\\n╭────────────╮\\n│ ❯ ', undefined, '/help — Help\\n/tasks — List tasks\\n/task add <title> — Add task')
process.stdin.off('keypress', ready)
process.stdout.write('RESULT:' + JSON.stringify(result) + '\\n')
terminal.close()
function ready(_text, key) {
  if (key.name === 'f12') process.stdout.write('INPUT_READY\\n')
}
`)
  // A real PTY exercises readline cursor state, wrapping, and suggestions without replacing Node globals.
  const script = `
import os, pty, select, signal, subprocess, sys, time, json, fcntl, termios, struct
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 40, 0, 0))
child = subprocess.Popen([sys.argv[1], '--import', sys.argv[2], sys.argv[3]], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
output = bytearray()
def until(marker):
    deadline = time.monotonic() + 10
    while marker not in output:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([master], [], [], max(0, remaining))[0]:
            raise RuntimeError(bytes(output).decode(errors='replace'))
        try:
            chunk = os.read(master, 65536)
        except OSError:
            raise RuntimeError(bytes(output).decode(errors='replace'))
        if not chunk:
            raise RuntimeError(bytes(output).decode(errors='replace'))
        output.extend(chunk)
try:
    until(b'HISTORY: ')
    os.write(master, b'previous\\n')
    until('│ ❯ '.encode())
    navigating = '\\x1b' in sys.argv[4]
    cursor = b'' if navigating else b'\\x1b[D\\x1b[D'
    os.write(master, sys.argv[4].encode() + cursor + b'\\x1b[24~')
    until(b'INPUT_READY')
    child.send_signal(signal.SIGUSR1)
    until(b'REMINDER_MARKER')
    os.write(master, sys.argv[5].encode())
    until(b'RESULT:')
    child.wait(timeout=10)
    while select.select([master], [], [], 0)[0]:
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        output.extend(chunk)
    print(json.dumps(bytes(output).decode(errors='replace')))
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
`
  const tsx = fileURLToPath(import.meta.resolve('tsx'))
  const { stdout } = await promisify(execFile)('python3', ['-c', script, process.execPath, tsx, fixture, typed, after], { timeout: 20_000 })
  const output: string = JSON.parse(stdout)
  expect(output).toContain('REMINDER_MARKER')
  const result = /RESULT:("[^\r\n]*")/u.exec(output)
  expect(result, output).not.toBeNull()
  expect(JSON.parse(result![1]!), output).toBe(expected)
}, 25_000)
