import type { LocalConfigPatch, LocalConfigSnapshot } from '@proj-airi/local-config'

import { defineInvokeEventa } from '@moeru/eventa'

export const localConfigRead = defineInvokeEventa<LocalConfigSnapshot>('eventa:invoke:local-config:read')
export const localConfigUpdate = defineInvokeEventa<LocalConfigSnapshot, LocalConfigPatch>('eventa:invoke:local-config:update')
