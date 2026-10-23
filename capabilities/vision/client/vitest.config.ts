import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/vision',
    include: ['src/**/*.test.ts'],
  },
})
