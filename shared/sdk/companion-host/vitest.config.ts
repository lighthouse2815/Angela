import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/host-sdk',
    include: ['src/**/*.test.ts'],
  },
})
