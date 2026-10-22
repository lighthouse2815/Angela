import process from 'node:process'

import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({ options: { 'out': { type: 'string' }, 'skip-build': { type: 'boolean' }, 'help': { type: 'boolean', short: 'h' } } })
if (values.help) {
  process.stdout.write('pnpm package:cli [--out PATH] [--skip-build]\nBuilds a portable directory and .tar.gz for this OS, architecture, and Node ABI. Requires pnpm and tar.\n')
  process.exit(0)
}
const manifest = JSON.parse(await readFile(join(root, 'packages', 'airi-cli', 'package.json'), 'utf8'))
const destination = resolve(values.out ?? join(root, 'dist', `angela-${manifest.version}-${process.platform}-${process.arch}-node${process.versions.modules}`))
const within = relative(root, destination)
if (!within || (!within.startsWith(`..${sep}`) && !isAbsolute(within) && !within.startsWith(`dist${sep}`)))
  throw new Error('Select an destination outside the checkout or under its dist directory.')
for (const path of [destination, `${destination}.tar.gz`]) {
  const existing = await lstat(path).catch((error) => {
    if (error.code !== 'ENOENT')
      throw error
  })
  if (existing)
    throw new Error(`Output already exists: ${path}`)
}

/** Keeps build and deploy destination visible. Disabling dependency auto-install prevents pnpm script checks from mutating the source workspace. */
async function run(command, args, cwd = root) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' } })
    child.once('error', reject)
    child.once('close', code => code === 0 ? done() : reject(new Error(`Packaging command failed: ${command} (${code})`)))
  })
}

await mkdir(dirname(destination), { recursive: true })
const stagingRoot = await mkdtemp(join(dirname(destination), '.angela-package-'))
const output = join(stagingRoot, basename(destination))
try {
  if (!values['skip-build'])
    await run('pnpm', ['run', 'build:cli'])
  // This flag applies only to deployment. The dedicated lockfile preserves pinned versions without changing workspace installation settings.
  await run('pnpm', ['--filter', '@angela/cli', '--config.inject-workspace-packages=true', 'deploy', '--prod', '--ignore-scripts', output])
  await mkdir(join(output, 'resources', 'openseeface'), { recursive: true })
  await mkdir(join(output, 'services', 'voice-local'), { recursive: true })
  for (const file of ['tracker.py', 'retinaface.py', 'remedian.py', 'similaritytransform.py', 'models', 'LICENSE', 'Licenses', 'README.md'])
    await cp(join(root, 'third_party', 'openseeface', file), join(output, 'resources', 'openseeface', file), { recursive: true })
  for (const file of ['compose.yaml', 'Dockerfile', 'app.py', 'capture.py', 'requirements.txt', 'README.md'])
    await cp(join(root, 'services', 'voice-local', file), join(output, 'services', 'voice-local', file))
  await cp(join(root, 'LICENSE'), join(output, 'LICENSE'))
  await writeFile(join(output, 'angela.mjs'), '#!/usr/bin/env node\nimport "./dist/bin/run.mjs"\n', { mode: 0o755 })
  await writeFile(join(output, 'portable.json'), `${JSON.stringify({ version: manifest.version, platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules, node: process.version }, null, 2)}\n`)
  await writeFile(join(output, 'INSTALL.txt'), `Angela portable CLI\n\nRequires Node.js ${manifest.engines.node} with ABI ${process.versions.modules}, ${process.platform}/${process.arch}.\nKeep this entire directory together. Run node angela.mjs setup, then node angela.mjs.\nYou can symlink angela.mjs into a directory on PATH. The source checkout and pnpm are unnecessary at runtime.\nConfiguration and user data stay in the standard user directories.\nVoice requires Docker and the host audio tools. Camera requires Python 3.11 and uv sync --locked --project python/camera-worker.\nThe camera remains off until /camera on. Desktop reminders require Linux, systemd, and notify-send.\n`)

  /** Rejects source-workspace links and accidental environment files before producing a transferable archive. */
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const target = relative(output, await realpath(path))
        if (target === '..' || target.startsWith(`..${sep}`) || isAbsolute(target))
          throw new Error(`Portable package contains an external symlink: ${path}`)
      }
      else if (entry.isDirectory()) {
        await inspect(path)
      }
      else if (/^\.env(?:\.|$)/u.test(entry.name) && !/\.(?:example|template)$/u.test(entry.name)) {
        throw new Error(`Portable package contains an environment file: ${path}`)
      }
    }
  }
  await inspect(output)
  await run(process.execPath, [join(output, 'angela.mjs'), '--help'], output)
  await run('tar', ['-czf', `${output}.tar.gz`, '-C', dirname(output), basename(output)])
  await rename(output, destination)
  await rename(`${output}.tar.gz`, `${destination}.tar.gz`)
  process.stdout.write(`Portable CLI: ${destination}\nArchive: ${destination}.tar.gz\n`)
}
finally {
  await rm(stagingRoot, { recursive: true, force: true })
}
