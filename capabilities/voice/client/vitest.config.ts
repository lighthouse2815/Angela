import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/voice-client',
    include: ['src/**/*.test.ts'],
  },
})
