import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, beforeEach, expect, it } from 'vitest'

const execute = promisify(execFile)
const entry = fileURLToPath(new URL('../dist/bin/run.mjs', import.meta.url))
let directory: string
let env: NodeJS.ProcessEnv

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-gateway-service-'))
  await writeFile(join(directory, 'systemctl'), `#!${process.execPath}
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.TEST_SYSTEMCTL_LOG, JSON.stringify(process.argv.slice(2)) + '\\n')
if (process.env.TEST_SYSTEMCTL_FAIL) process.exit(1)
if (process.argv.includes('show')) console.log('ActiveState=inactive')
`, { mode: 0o700 })
  env = { ...process.env, XDG_CONFIG_HOME: directory, PATH: `${directory}${delimiter}${process.env.PATH}`, TEST_SYSTEMCTL_LOG: join(directory, 'calls.jsonl') }
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it('installs a private user unit without shell expansion, credentials, or overwriting another unit', async () => {
  const data = join(directory, 'data $HOME %n "quoted"')
  const args = [entry, 'gateway', 'service', 'install', '--data-dir', data, '--port', '1107', '--locale', 'en']
  await execute(process.execPath, args, { env })
  const path = join(directory, 'systemd', 'user', 'angela-gateway.service')
  const unit = await readFile(path, 'utf8')
  expect(unit).toContain('"gateway" "start"')
  expect(unit).toContain('$$HOME %%n \\"quoted\\"')
  expect(unit).toContain('"--port" "1107"')
  expect(unit).toContain('Restart=on-failure')
  expect(unit).not.toContain('--background')
  expect(unit).not.toContain('JWT_SECRET')
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  expect(JSON.parse((await readFile(env.TEST_SYSTEMCTL_LOG!, 'utf8')).trim())).toEqual(['--user', 'daemon-reload'])
  await execute(process.execPath, args, { env })
  await writeFile(path, 'custom service\n')
  await expect(execute(process.execPath, args, { env })).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe('custom service\n')
})

it('controls only the user gateway service and reports command failures', async () => {
  await execute(process.execPath, [entry, 'gateway', 'stop'], { env })
  await execute(process.execPath, [entry, 'gateway', 'service', 'disable'], { env })
  const result = await execute(process.execPath, [entry, 'gateway', 'service', 'status'], { env })
  expect(result.stdout).toContain('ActiveState=inactive')
  const calls = (await readFile(env.TEST_SYSTEMCTL_LOG!, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(calls).toEqual([
    ['--user', 'stop', 'angela-gateway.service'],
    ['--user', 'disable', '--now', 'angela-gateway.service'],
    ['--user', 'show', 'angela-gateway.service', '--property=ActiveState,SubState,UnitFileState'],
  ])
  await expect(execute(process.execPath, [entry, 'gateway', 'stop'], { env: { ...env, TEST_SYSTEMCTL_FAIL: '1' } })).rejects.toThrow()
})
