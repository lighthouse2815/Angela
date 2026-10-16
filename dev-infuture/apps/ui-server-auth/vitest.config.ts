import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    test: {
      include: ['src/**/*.test.ts'],
      env: loadEnv(mode, import.meta.dirname, ''),
    },
  }
})
