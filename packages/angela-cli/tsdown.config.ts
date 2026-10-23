import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'bin/run': 'src/bin/run.ts', 'runtime/runtime': 'src/runtime/runtime.ts', 'companion/records': 'src/companion/records.ts', 'companion/contracts': 'src/companion/contracts.ts' },
  target: 'node22',
  sourcemap: true,
})
