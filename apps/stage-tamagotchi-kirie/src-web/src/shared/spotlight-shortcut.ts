import type { ShortcutAccelerator, ShortcutModifier } from '@angela/stage-shared/global-shortcut'

const safeModifiers = new Set<ShortcutModifier>(['cmd', 'ctrl', 'alt', 'super'])

export function isSafeSpotlightAccelerator(accelerator: ShortcutAccelerator): boolean {
  return accelerator.modifiers.some(modifier => safeModifiers.has(modifier))
}
