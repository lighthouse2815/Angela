import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

const manifestSchema = v.object({
  manifest_version: v.literal(3),
  name: v.literal('Angela Study Along'),
  permissions: v.array(v.picklist(['activeTab', 'scripting', 'storage'])),
  host_permissions: v.array(v.literal('http://127.0.0.1/*')),
  background: v.object({ service_worker: v.literal('background.js') }),
  action: v.object({ default_popup: v.literal('popup.html') }),
  content_scripts: v.optional(v.pipe(v.array(v.unknown()), v.maxLength(0))),
})

/** Rejects the general browser extension build. Release payloads contain only the restricted active-tab integration. */
export async function checkStudyExtension(directory: string) {
  v.parse(manifestSchema, JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
  await Promise.all(['background.js', 'popup.html'].map(file => access(join(directory, file))))
}
