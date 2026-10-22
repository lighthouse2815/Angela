import type { ElectronMcpStdioServerConfig } from './eventa'

/** Angela's browser server uses the existing MCP process and tool lifecycle. */
export const browserServerName = 'angela-browser'

/** Pin the runtime so updates cannot silently change browser tool contracts. */
export const browserServerConfig = {
  command: 'npx',
  args: ['-y', '@playwright/mcp@0.0.83', '--caps=vision,pdf,devtools'],
  enabled: true,
} satisfies ElectronMcpStdioServerConfig
