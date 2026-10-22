import type { LocalConfigPatch, LocalConfigSnapshot } from '@angela/local-config'

import { defineInvokeEventa } from '@moeru/eventa'

export const localConfigRead = defineInvokeEventa<LocalConfigSnapshot>('eventa:invoke:local-config:read')
export const localConfigUpdate = defineInvokeEventa<LocalConfigSnapshot, LocalConfigPatch>('eventa:invoke:local-config:update')
