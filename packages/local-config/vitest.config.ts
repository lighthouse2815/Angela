import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: '@angela/local-config', include: ['src/**/*.test.ts'] },
})
