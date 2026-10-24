import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkStudyExtension } from './study-extension-artifact'

let directory: string
const manifest = { manifest_version: 3, name: 'Angela Study Along', permissions: ['activeTab', 'scripting', 'storage'], host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'background.js' }, action: { default_popup: 'popup.html' } }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-extension-artifact-'))
  await Promise.all(['background.js', 'popup.html'].map(file => writeFile(join(directory, file), 'artifact fixture')))
})
afterEach(async () => rm(directory, { recursive: true, force: true }))

describe('restricted extension release artifact', () => {
  it('accepts the restricted MV3 build', async () => {
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
    await expect(checkStudyExtension(directory)).resolves.toBeUndefined()
  })

  it.each([
    { ...manifest, permissions: ['cookies'] },
    { ...manifest, host_permissions: ['<all_urls>'] },
    { ...manifest, content_scripts: [{ matches: ['*://*/*'], js: ['collector.js'] }] },
  ])('rejects broader permissions and implicit content collectors', async (invalid) => {
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(invalid))
    await expect(checkStudyExtension(directory)).rejects.toThrow()
  })
})
