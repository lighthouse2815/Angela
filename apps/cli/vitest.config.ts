import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/cli',
    include: ['src/**/*.test.ts'],
  },
})
