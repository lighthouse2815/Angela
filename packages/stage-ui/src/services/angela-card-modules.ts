import type { AngelaExtension } from '../types/angela-card'

/** Persisted defaults, separate from the selections applied by the active card. */
export type CardModuleDefaults = Pick<AngelaExtension['modules'], 'consciousness' | 'vision' | 'speech' | 'displayModelId'>

/**
 * Resolves a card selection without borrowing a model from another provider.
 * An empty model remains unconfigured when the card changes provider.
 * The caller must ask for a model or use that provider's own default.
 */
export function resolveModuleSelection(
  selection: AngelaExtension['modules']['consciousness'],
  defaults: AngelaExtension['modules']['consciousness'],
): AngelaExtension['modules']['consciousness'] {
  const provider = selection.provider || defaults.provider
  const model = selection.model || (provider === defaults.provider ? defaults.model : '')
  return { provider, model }
}
