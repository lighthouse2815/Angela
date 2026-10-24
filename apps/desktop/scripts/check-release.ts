import process, { arch, argv, platform } from 'node:process'

/**
 * Reports all local release prerequisites before installer packaging. No downloads or configuration edits occur.
 *
 * Call stack:
 *
 * pnpm check:release [platform] [arch]
 *   -> checkMediaArtifacts + checkStudyExtension + application output checks
 *   -> JSON readiness report and process exit code
 */
import { access } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'

import { mediaTarget } from '../src/main/services/angela/internet/media/resolver'
import { checkMediaArtifacts } from './media-artifacts'
import { checkStudyExtension } from './study-extension-artifact'

const targetPlatform = argv[2] ?? platform
const target = mediaTarget(targetPlatform, argv[3] ?? arch)
const root = join(import.meta.dirname, '..')
const checks = [
  { name: 'media', run: () => checkMediaArtifacts(join(root, 'resources/media', target), targetPlatform === 'win32') },
  { name: 'extension', run: () => checkStudyExtension(join(root, '../../integrations/plugins/web-extension/.output-study-along/chrome-mv3')) },
  ...['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html'].map(file => ({ name: file, run: () => access(join(root, file)) })),
]
const results = await Promise.all(checks.map(async (check) => {
  try {
    await check.run()
    return { check: check.name, ready: true }
  }
  catch (cause) {
    return { check: check.name, ready: false, detail: errorMessageFrom(cause) ?? 'Release prerequisite failed' }
  }
}))
console.info(JSON.stringify({ target, ready: results.every(result => result.ready), checks: results }, null, 2))
if (results.some(result => !result.ready))
  process.exitCode = 1
