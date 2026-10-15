/**
 * Builds the CLI against this system's native libraries for desktop development.
 * The installed package version selects both the source tag and the cache directory.
 *
 * Call stack:
 *
 * pnpm setup:computer-use
 *   -> cargo install (pinned AUV source)
 *     -> auv --version
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { platform } from 'node:process'

import cliPackage from '@auv-js/cli/package.json' with { type: 'json' }

const installRoot = resolve(import.meta.dirname, '..', '..', '..', '.cache', 'auv', cliPackage.version)

// Debug mode and one compiler process limit memory use on development laptops.
execFileSync('cargo', [
  'install',
  '--git',
  'https://github.com/moeru-ai/auv',
  '--tag',
  `v${cliPackage.version}`,
  '--locked',
  '--debug',
  '--jobs',
  '1',
  '--root',
  installRoot,
  'auv-cli',
  '--bin',
  'auv',
], { stdio: 'inherit' })

const executable = resolve(installRoot, 'bin', platform === 'win32' ? 'auv.exe' : 'auv')
execFileSync(executable, ['--version'], { stdio: 'inherit' })
console.info(`Native AUV executable: ${executable}`)
