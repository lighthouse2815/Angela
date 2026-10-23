import process, { cwd, env } from 'node:process'

import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import messages from '@angela/i18n/locales'
import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import templateCompilerOptions from '@tresjs/core/template-compiler-options'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Basemove, { createS3Provider } from 'unplugin-basemove/vite'
import Info from 'unplugin-info/vite'
import Yaml from 'unplugin-yaml/vite'
import Mkcert from 'vite-plugin-mkcert'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import VueMacros from 'vue-macros/vite'
import VueRouter from 'vue-router/vite'

import { localeRemap, serializeStartupFallbackLocales } from '@angela/i18n'
import { localConfigPlugin } from '@angela/local-config/vite'
import { paraformerBilingualZhEn, xAsrBilingualZhEnInt8, zipformerMultilingual } from '@angela/provider-inference/sherpaw-transcription/models'
import { kwsModel } from '@angela/stage-ui/libs/voice/kws-model-info'
import { Sherpaw } from '@angela/vite-plugin-sherpaw'
import { tryCatch } from '@moeru/std'
import { Download } from '@proj-airi/unplugin-fetch/vite'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk/vite'
import { LFS, SpaceCard } from 'hfup/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const stageUIAssetsRoot = resolve(join(import.meta.dirname, '..', '..', 'shared/ui/stage/src', 'assets'))
const sharedCacheDir = resolve(join(import.meta.dirname, '..', '..', '.cache'))

function hasFlagEnableMkcert(): boolean {
  if (process.argv.includes('--mkcert')) {
    return true
  }
  if (env.STAGE_WEB_ENABLE_MKCERT === 'true') {
    return true
  }

  return false
}

export default defineConfig({
  optimizeDeps: {
    exclude: [
      // Internal Packages
      '@angela/stage-ui/*',
      '@proj-airi/drizzle-duckdb-wasm',
      '@proj-airi/drizzle-duckdb-wasm/*',

      // Static Assets: Models, Images, etc.
      'public/assets/*',

      // Live2D SDK
      '@framework/live2dcubismframework',
      '@framework/math/cubismmatrix44',
      '@framework/type/csmvector',
      '@framework/math/cubismviewmatrix',
      '@framework/cubismdefaultparameterid',
      '@framework/cubismmodelsettingjson',
      '@framework/effect/cubismbreath',
      '@framework/effect/cubismeyeblink',
      '@framework/model/cubismusermodel',
      '@framework/motion/acubismmotion',
      '@framework/motion/cubismmotionqueuemanager',
      '@framework/type/csmmap',
      '@framework/utils/cubismdebug',
      '@framework/model/cubismmoc',
    ],
  },
  resolve: {
    alias: {
      '@angela/server-sdk': resolve(join(import.meta.dirname, '..', '..', 'shared/sdk/server/src')),
      '@angela/i18n': resolve(join(import.meta.dirname, '..', '..', 'shared/i18n/src')),
      '@angela/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'shared/ui/stage/src')),
      '@angela/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'shared/ui/pages/src')),
      '@angela/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'shared/ui/stage-shared/src')),
      '@angela/stage-layouts': resolve(join(import.meta.dirname, '..', '..', 'shared/ui/layouts/src')),
    },
  },
  server: {
    fs: {
      // To mute errors like:
      //   The request id ".../node_modules/@fontsource/sniglet/files/sniglet-latin-400-normal.woff" is outside of Vite serving allow list.
      //
      // See: https://vite.dev/config/server-options#server-fs-strict
      strict: false,
    },
    warmup: {
      clientFiles: [
        `${resolve(join(import.meta.dirname, '..', '..', 'shared/ui/stage/src'))}/*.vue`,
        `${resolve(join(import.meta.dirname, '..', '..', 'shared/ui/pages/src'))}/*.vue`,
      ],
    },
  },
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        chunkFileNames: (chunkInfo) => {
          const containsAnalyticsModule = chunkInfo.moduleIds.some((moduleId) => {
            const normalizedModuleId = moduleId.replaceAll('\\', '/').toLowerCase()
            return normalizedModuleId.includes('analytics') || normalizedModuleId.includes('openpanel')
          })

          // Only analytics/provider chunks receive the manual neutral mapping;
          // all unrelated chunks retain Vite's readable default naming.
          return containsAnalyticsModule
            ? 'assets/auxiliary-[hash].js'
            : 'assets/[name]-[hash].js'
        },
      },
    },
    sourcemap: true,
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        inlineDynamicImports: false,
      },
    },
  },

  plugins: [
    localConfigPlugin(),
    {
      name: 'airi-startup-locales',
      transformIndexHtml: html => html.replace('__AIRI_STARTUP_LOCALES__', serializeStartupFallbackLocales(messages, localeRemap)),
    },
    ...(
      hasFlagEnableMkcert()
        ? [Mkcert((() => {
            // Workaround: plugin's bundled downloader has a feaxios bug, prefer system mkcert
            const command = process.platform === 'win32' ? 'where' : 'which'

            const { data } = tryCatch(() => ({ mkcertPath: execSync(`${command} mkcert`, { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0] }))
            return data
          })())]
        : []
    ),

    Info(),

    Yaml(),

    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
          ...templateCompilerOptions,
        }),
        vueJsx: false,
      },
      betterDefine: false,
    }),

    VueRouter({
      extensions: ['.vue', '.md'],
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      importMode: 'async',
      routesFolder: [
        resolve(import.meta.dirname, 'src', 'pages'),
        resolve(import.meta.dirname, '..', '..', 'shared/ui/pages/src', 'pages'),
      ],
      exclude: ['**/components/**'],
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts({
      layoutsDirs: [
        resolve(import.meta.dirname, 'src', 'layouts'),
        resolve(import.meta.dirname, '..', '..', 'shared/ui/layouts/src', 'layouts'),
      ],
    }),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),

    // https://github.com/antfu/vite-plugin-pwa
    // NOTICE:
    // The plugin must stay registered in dev — `src/modules/pwa.ts` imports
    // the `virtual:pwa-register` module the plugin synthesises, and dropping
    // the plugin breaks Vite's import-analysis with a "Failed to resolve
    // import" error.
    // SW generation in dev is already disabled by `devOptions.enabled:
    // false` (the plugin's own default). So new SWs do NOT register from
    // `pnpm dev` alone — but a previously-registered SW (e.g. from an
    // earlier `vite preview` / `vite build`) lives on per-origin in the
    // browser and keeps intercepting fetches even in dev. To recover from
    // that state, unregister via DevTools → Application → Storage → Clear
    // site data.
    ...(env.TARGET_HUGGINGFACE_SPACE
      ? []
      : [VitePWA({
          registerType: 'prompt',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            name: 'Angela',
            short_name: 'Angela',
            icons: [
              {
                src: '/web-app-manifest-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: '/web-app-manifest-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
              {
                purpose: 'maskable',
                sizes: '192x192',
                src: '/maskable_icon_x192.png',
                type: 'image/png',
              },
              {
                purpose: 'maskable',
                sizes: '512x512',
                src: '/maskable_icon_x512.png',
                type: 'image/png',
              },
            ],
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
            // The WebAssembly files are over 80% of the build (DuckDB alone ships
            // three variants and a browser loads one). Precaching them downloads
            // them all at install, so they are cached on first use instead.
            globIgnores: ['**/*.wasm'],
            runtimeCaching: [
              {
                urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
                // The file names carry a content hash, so a cached file never goes stale.
                handler: 'CacheFirst',
                options: {
                  cacheName: 'wasm',
                  expiration: { maxEntries: 8 },
                },
              },
            ],
            // Cloudflare redirects /index.html to /. Cache the canonical response
            // so navigation fallbacks never replay a redirected response.
            modifyURLPrefix: { 'index.html': './' },
            navigateFallback: './',
            navigateFallbackDenylist: [
              /^\/docs\//,
              /^\/ui\//,
              /^\/remote-assets\//,
              /^\/api\//,
            ],
          },
        })]),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
    }),

    // Browser tests mount short-lived apps. A delayed DevTools setup can run
    // after the test app is gone, so only load this plugin for the real app.
    ...(env.VITEST ? [] : [VueDevTools()]),

    // Web exposes pinned remote models. The browser downloads only the selected model.
    // The wake word model downloads when wake word detection first prepares.
    Sherpaw({ models: [paraformerBilingualZhEn, zipformerMultilingual, xAsrBilingualZhEnInt8, kwsModel], cacheDir: sharedCacheDir }),
    DownloadLive2DSDK(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'vrm/models/AvatarSample-A', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'vrm/models/AvatarSample-B', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),

    // HuggingFace Spaces
    LFS({ root: cwd(), extraGlobs: [
      // Scene & Models
      '*.vrm',
      '*.vrma',
      '*.hdr',
      '*.cmo3',
      // Images & Fonts
      '*.png',
      '*.jpg',
      '*.jpeg',
      '*.gif',
      '*.webp',
      '*.bmp',
      '*.ttf',
      '*.avif',
      // Tensorflow / MediaPipe task
      '*.task',
    ] }),
    SpaceCard({
      root: cwd(),
      title: 'Angela: AI Companion',
      emoji: '🧸',
      colorFrom: 'pink',
      colorTo: 'pink',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: [
        'onnx-community/whisper-base',
        'onnx-community/silero-vad',
      ],
      short_description: 'AI driven VTuber & Companion, supports Live2D and VRM.',
    }),

    // For the following example assets:
    //
    // dist/assets/ort-wasm-simd-threaded.jsep-B0T3yYHD.wasm                21,596.01 kB │ gzip: 5,121.95 kB
    // dist/assets/XiaolaiSC-Regular-SNWuh554.ttf                           22,183.94 kB
    // dist/assets/cjkFonts_allseto_v1.11-ByBdljxl.ttf                      31,337.14 kB
    // dist/assets/duckdb-coi-CSr8FQO4.wasm                                 32,320.49 kB │ gzip: 7,194.65 kB
    // dist/assets/duckdb-eh-BJOC5S4x.wasm                                  32,604.02 kB │ gzip: 7,133.37 kB
    // dist/assets/duckdb-mvp-8HYqhb4i.wasm                                 37,345.64 kB │ gzip: 8,099.69 kB
    //
    // they are too large to be able to put into deployments like Cloudflare Workers or Pages,
    // we need to upload them to external storage and use renderBuiltUrl to rewrite their URLs.
    ...((!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
      ? []
      : [
          Basemove({
            prefix: env.STAGE_WEB_WARP_DRIVE_PREFIX || 'proj-airi/stage-web/main/',
            include: [/\.wasm$/i, /\.ttf$/i, /\.vrm$/i, /\.zip$/i, /\.(?:data|metadata)$/i],
            manifest: true,
            clean: false,
            contentTypeBy: (filename: string) => {
              if (filename.endsWith('.wasm')) {
                return 'application/wasm'
              }
              if (filename.endsWith('.ttf')) {
                return 'font/ttf'
              }
              if (filename.endsWith('.metadata')) {
                return 'application/json'
              }
              if (filename.endsWith('.vrm') || filename.endsWith('.data')) {
                return 'application/octet-stream'
              }
              if (filename.endsWith('.zip')) {
                return 'application/zip'
              }
            },
            provider: createS3Provider({
              endpoint: env.S3_ENDPOINT,
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
              region: env.S3_REGION,
              publicBaseUrl: env.WARP_DRIVE_PUBLIC_BASE ?? env.S3_ENDPOINT,
            }),
          }),
        ]),
  ],
})
