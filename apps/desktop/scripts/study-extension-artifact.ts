import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

const manifestSchema = v.strictObject({
  manifest_version: v.literal(3),
  name: v.literal('Angela Study Along'),
  version: v.optional(v.string()),
  version_name: v.optional(v.string()),
  description: v.optional(v.string()),
  icons: v.optional(v.record(v.string(), v.string())),
  permissions: v.array(v.picklist(['activeTab', 'scripting', 'storage'])),
  host_permissions: v.array(v.literal('http://127.0.0.1/*')),
  background: v.strictObject({ service_worker: v.literal('background.js') }),
  action: v.strictObject({ default_popup: v.literal('popup.html'), default_title: v.optional(v.string()) }),
  content_scripts: v.optional(v.pipe(v.array(v.unknown()), v.maxLength(0))),
})

/** Rejects the general browser extension build. Release payloads contain only the restricted active-tab integration. */
export async function checkStudyExtension(directory: string) {
  v.parse(manifestSchema, JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
  await Promise.all(['background.js', 'popup.html'].map(file => access(join(directory, file))))
}
