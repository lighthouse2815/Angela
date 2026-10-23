import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/discord-bot',
    include: ['src/**/*.test.ts'],
  },
})
