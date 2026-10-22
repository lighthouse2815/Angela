import { defineConfig } from 'vitest/config'

import { providerInferenceProjects } from './packages/provider-inference/vitest.config'

export default defineConfig({
  test: {
    projects: [
      'server/apps/api',
      'apps/desktop/vitest.node.config.ts',
      'packages/cap-vite',
      'packages/angela-cli',
      'evals/companion',
      'evals/companion-generation',
      'integrations/discord-bot',
      'packages/local-config',
      'packages/ccc',
      'packages/core-agent',
      'packages/i18n',
      'packages/pipelines-audio',
      'packages/input-gamepad',
      'packages/input-gamepad-vueuse',
      'packages/input-playstation-dualsense-5',
      'packages/model-driver-lipsync',
      'packages/better-ws',
      'packages/plugin-sdk',
      'packages/plugin-sdk-desktop',
      ...providerInferenceProjects.map(project => ({ ...project, root: 'packages/provider-inference' })),
      'packages/scenarios-desktop-browser',
      'packages/scenarios-desktop-electron',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
      'packages/stage-ui-live2d/vitest.node.config.ts',
      'packages/stage-ui-three',
      'packages/vitest-plugin-fakemic',
      'packages/vite-plugin-sherpaw',
      // Locale checks shared by local tools.
      {
        test: {
          name: 'locale-scripts',
          include: ['scripts/i18n/**/*.test.ts'],
        },
      },
    ],
  },
})
