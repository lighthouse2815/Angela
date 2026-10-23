import { globSync } from 'node:fs'

import { defineConfig } from 'tsdown'

const entry = Object.fromEntries(globSync('src/**/*.ts', { cwd: import.meta.dirname, exclude: ['**/*.test.ts'] })
  .map(path => [path.slice(4, -3), path]))

export default defineConfig({
  entry,
  target: 'node22',
  sourcemap: true,
})
