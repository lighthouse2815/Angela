import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@angela/font-cjkfonts-allseto',
    '@angela/font-departure-mono',
    '@angela/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
})
