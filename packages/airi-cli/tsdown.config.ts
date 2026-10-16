import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'bin/run': 'src/bin/run.ts' },
  target: 'node22',
  sourcemap: true,
})
