import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/adapters/angela-adapter.ts'],
  target: 'node22',
})
