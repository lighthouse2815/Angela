import type { WxtViteConfig } from 'wxt'

import UnoCSS from 'unocss/vite'

import { defineConfig } from 'wxt'

/** A restricted build uses the existing extension toolchain without page, subtitle, screenshot, or history collectors. */
export default defineConfig({
  vite: () => ({ plugins: [UnoCSS() as NonNullable<WxtViteConfig['plugins']>[number]] }),
  modules: ['@wxt-dev/module-vue'],
  entrypointsDir: 'study-along/entrypoints',
  outDir: '.output-study-along',
  manifest: {
    name: 'Angela Study Along',
    description: 'Share the playback position of a YouTube tab you authorize with Angela Desktop.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['http://127.0.0.1/*'],
    action: { default_title: 'Angela Study Along' },
  },
})
