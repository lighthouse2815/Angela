import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@angela/companion',
    include: ['src/**/*.test.ts'],
  },
})
