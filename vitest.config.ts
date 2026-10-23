import { defineConfig } from 'vitest/config'

import { providerInferenceProjects } from './providers/inference/vitest.config'

export default defineConfig({
  test: {
    projects: [
      'backend/api',
      'apps/desktop/vitest.node.config.ts',
      'shared/tooling/cap-vite',
      'apps/cli',
      'core/companion',
      'capabilities/voice/client',
      'capabilities/vision/client',
      'shared/sdk/companion-host',
      'integrations/telegram',
      'integrations/discord/runtime',
      'integrations/zalo',
      'evals/companion',
      'evals/companion-generation',
      'integrations/discord',
      'shared/config',
      'shared/ui/ccc',
      'core/agent',
      'shared/i18n',
      'capabilities/voice/pipelines',
      'capabilities/input/gamepad',
      'capabilities/input/gamepad-vueuse',
      'capabilities/input/dualsense',
      'capabilities/avatar/lipsync',
      'shared/tooling/better-ws',
      'shared/sdk/plugin',
      'shared/sdk/plugin-desktop',
      ...providerInferenceProjects.map(project => ({ ...project, root: 'providers/inference' })),
      'shared/tooling/scenarios-desktop-browser',
      'shared/tooling/scenarios-desktop-electron',
      'backend/channel/runtime',
      'shared/sdk/server',
      'shared/ui/stage-shared',
      'capabilities/avatar/live2d/vitest.node.config.ts',
      'capabilities/avatar/three',
      'shared/tooling/vitest-plugin-fakemic',
      'shared/tooling/vite-plugin-sherpaw',
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
