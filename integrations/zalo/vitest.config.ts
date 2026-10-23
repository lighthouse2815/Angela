import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/zalo',
    include: ['src/**/*.test.ts'],
  },
})
