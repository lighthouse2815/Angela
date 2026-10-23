import type { Config } from '../config/types'
import type { Context } from '../core/browser/context'
import type { AngelaAdapter } from './angela-adapter'
import type { MCPAdapter } from './mcp-adapter'

import { logger } from '../utils/logger'

export function useAdapter() {
  const adapters: { airi?: AngelaAdapter, mcp?: MCPAdapter } = {}

  async function initAdapters(config: Config, ctx: Context): Promise<{ airi?: AngelaAdapter, mcp?: MCPAdapter }> {
    if (config.adapters.airi?.enabled) {
      logger.main.log('Starting Angela adapter...')
      const { AngelaAdapter } = await import('./angela-adapter')

      adapters.airi = new AngelaAdapter(ctx, {
        url: config.adapters.airi.url,
        token: config.adapters.airi.token,
        credentials: config.credentials || {},
      })

      await adapters.airi.start()
      logger.main.log('Angela adapter started')
    }

    if (config.adapters.mcp?.enabled) {
      logger.main.log('Starting MCP adapter...')
      const { MCPAdapter } = await import('./mcp-adapter')

      adapters.mcp = new MCPAdapter(config.adapters.mcp.port, ctx)

      await adapters.mcp.start()
      logger.main.log('MCP adapter started')
    }

    return adapters
  }

  return {
    adapters,
    initAdapters,
  }
}
