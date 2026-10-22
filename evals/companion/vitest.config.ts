import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@angela/evals-companion',
    include: ['*.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
})
