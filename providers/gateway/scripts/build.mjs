import process from 'node:process'

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = fileURLToPath(new URL('../vendor/', import.meta.url))
const output = join(packageRoot, 'dist')

/**
 * Builds the in-repository engine into one portable server directory. No registry gateway package or upstream CLI is installed.
 * Isolated dependencies keep the imported React application outside Angela's Vue dependency graph.
 *
 * Call stack:
 * build:cli -> @angela/gateway build -> pnpm install -> Next standalone -> dist
 */
async function run(args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
      cwd: source,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env,
    })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Angela Gateway build failed (${code})`)))
  })
}

const temporary = await mkdtemp(join(tmpdir(), 'angela-gateway-build-'))
try {
  const env = {
    ...process.env,
    DATA_DIR: temporary,
    JWT_SECRET: randomBytes(32).toString('hex'),
    INITIAL_PASSWORD: randomBytes(32).toString('hex'),
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const lock = await readFile(join(source, 'pnpm-lock.yaml'))
  const digest = createHash('sha256').update(lock).update(await readFile(join(source, 'pnpm-workspace.yaml'))).digest('hex')
  const marker = join(source, 'node_modules', '.angela-lock')
  const installed = await readFile(marker, 'utf8').catch(() => '')
  if (installed !== digest) {
    await run(['install', '--frozen-lockfile', '--ignore-scripts'], env)
    await writeFile(marker, digest)
  }
  await run(['run', 'build'], env)
  // dist contains only generated artifacts. Remove the previous build before copying so deleted routes cannot survive a rebuild.
  await rm(output, { recursive: true, force: true })
  // Package archives omit symbolic links. The isolated hoisted install and dereferenced copy keep every runtime dependency in the archive.
  await cp(join(source, '.next', 'standalone'), output, { recursive: true, dereference: true })
  await cp(join(source, 'NOTICE'), join(output, 'LICENSE'))
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
