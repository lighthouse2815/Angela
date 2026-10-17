import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/adapters/airi-adapter.ts'],
  target: 'node22',
})
