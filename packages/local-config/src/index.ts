import type { InferenceServiceProvider } from '@angela/provider-inference'

import * as v from 'valibot'

/** User-owned provider settings. Authentication sessions and cloud replica metadata stay with their owning application. */
export type LocalProvider = Pick<InferenceServiceProvider, 'definitionId' | 'config' | 'status'>

export const localProviderSchema: v.GenericSchema<LocalProvider> = v.object({
  definitionId: v.pipe(v.string(), v.nonEmpty()),
  config: v.record(v.string(), v.unknown()),
  status: v.picklist(['unconfigured', 'validating', 'configured', 'invalid', 'bypassed']),
})

export const chatSelectionSchema = v.object({ provider: v.string(), model: v.string() })

/** The same versioned file supplies provider settings to desktop, local web, and CLI hosts. */
export const localConfigSchema = v.object({
  version: v.literal(1),
  providers: v.record(v.string(), localProviderSchema),
  chat: chatSelectionSchema,
})
export type LocalConfig = v.InferOutput<typeof localConfigSchema>

/** A null provider removes only that provider. Unmentioned providers keep their current file values. */
export const localConfigPatchSchema = v.object({
  providers: v.optional(v.record(v.string(), v.nullable(localProviderSchema))),
  chat: v.optional(chatSelectionSchema),
})
export type LocalConfigPatch = v.InferOutput<typeof localConfigPatchSchema>

export const localConfigSnapshotSchema = v.object({
  id: v.string(),
  config: v.nullable(localConfigSchema),
  revision: v.string(),
})
export type LocalConfigSnapshot = v.InferOutput<typeof localConfigSnapshotSchema>

/** Hosts supply transport only. Renderers never receive a filesystem path from a remote page. */
export interface LocalConfigTransport {
  read: () => Promise<LocalConfigSnapshot>
  update: (patch: LocalConfigPatch) => Promise<LocalConfigSnapshot>
}

/** Read-only base for an absent file. Writers copy its fields before applying a patch. */
export const emptyLocalConfig: LocalConfig = Object.freeze({
  version: 1,
  providers: Object.freeze({}),
  chat: Object.freeze({ provider: '', model: '' }),
})

/** Contains no Node imports, so local web renderers can use the same transport contract. */
export class HttpLocalConfig implements LocalConfigTransport {
  constructor(private readonly endpoint = '/__angela/local-config') {}

  async read() {
    return await this.request('GET')
  }

  async update(patch: LocalConfigPatch) {
    return await this.request('PATCH', v.parse(localConfigPatchSchema, patch))
  }

  private async request(method: string, patch?: LocalConfigPatch): Promise<LocalConfigSnapshot> {
    const response = await fetch(this.endpoint, {
      method,
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'X-Angela-Config': '1', 'Content-Type': 'application/json' },
      body: patch ? JSON.stringify(patch) : undefined,
    })
    if (!response.ok)
      throw new Error(`Local configuration request failed (${response.status})`)
    return v.parse(localConfigSnapshotSchema, await response.json())
  }
}
