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

it.skipIf(process.platform === 'win32').each([
  ['abcde', 'abcXde'],
  ['abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxXyz'],
  ['/tas', '/tXas'],
])('preserves editable text and cursor through a real terminal notification: %s', async (typed, expected) => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-terminal-'))
  directories.push(directory)
  const fixture = join(directory, 'terminal.mjs')
  const module = fileURLToPath(new URL('./terminal.ts', import.meta.url))
  await writeFile(fixture, `
import process from 'node:process'
import { Terminal } from ${JSON.stringify(module)}
const terminal = new Terminal(() => terminal.close())
process.once('SIGUSR1', () => terminal.notify('REMINDER_MARKER'))
const result = await terminal.ask('\\n╭────────────╮\\n│ ❯ ', undefined, '/tasks — List tasks')
process.stdout.write('RESULT:' + JSON.stringify(result) + '\\n')
terminal.close()
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
    until('│ ❯ '.encode())
    os.write(master, sys.argv[4].encode() + b'\\x1b[D\\x1b[D')
    until(sys.argv[4][-2:].encode())
    child.send_signal(signal.SIGUSR1)
    until(b'REMINDER_MARKER')
    os.write(master, b'X\\n')
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
  const { stdout } = await promisify(execFile)('python3', ['-c', script, process.execPath, tsx, fixture, typed], { timeout: 20_000 })
  const output: string = JSON.parse(stdout)
  expect(output).toContain('REMINDER_MARKER')
  const result = /RESULT:("[^\r\n]*")/u.exec(output)
  expect(result, output).not.toBeNull()
  expect(JSON.parse(result![1]!)).toBe(expected)
}, 25_000)
