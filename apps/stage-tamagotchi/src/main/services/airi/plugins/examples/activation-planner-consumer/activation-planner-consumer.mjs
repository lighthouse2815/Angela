import { defineExtension } from '@angela/plugin-sdk'

/**
 * Requires the example Provider through a static Kit declaration.
 *
 * Phase 2 does not resolve or call a runtime Kit implementation.
 */
export default defineExtension({
  id: 'activation-planner-consumer',
  setup() {
    console.info('[activation-planner-consumer] setup')
  },
})
