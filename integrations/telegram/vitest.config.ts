import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/telegram',
    include: ['src/**/*.test.ts'],
  },
})
