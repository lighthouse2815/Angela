import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/discord-bot',
    include: ['src/**/*.test.ts'],
  },
})
