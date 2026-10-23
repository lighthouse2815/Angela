import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const execute = promisify(execFile)

it('loads the overlay smoke entry point in Node without Vite globals', async () => {
  const result = await execute(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    'await import("./scripts/desktop-overlay-live-window-smoke.ts")',
  ], {
    cwd: new URL('..', import.meta.url),
    timeout: 15_000,
  })

  expect(result.stdout).toBe('')
  expect(result.stderr).toBe('')
})
