import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: '@proj-airi/local-config', include: ['src/**/*.test.ts'] },
})
