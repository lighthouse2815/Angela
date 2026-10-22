/**
 * Adds Angela Browser to an existing desktop MCP configuration without replacing servers.
 *
 * Call stack:
 *
 * pnpm setup:browser <mcp.json>
 *   -> parseElectronMcpConfigText
 *   -> MCP connection and browser tool discovery
 *   -> writeFile (merged configuration)
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { argv } from 'node:process'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { browserServerConfig, browserServerName } from '../src/shared/browser-mcp'
import { parseElectronMcpConfigText } from '../src/shared/mcp-config'

const configPath = argv[2]
if (!configPath)
  throw new Error('Usage: pnpm -F @angela/desktop setup:browser <path-to-mcp.json>')

const path = resolve(configPath)
const config = parseElectronMcpConfigText(await readFile(path, 'utf8'))
if (Object.hasOwn(config.mcpServers, browserServerName)) {
  console.info('Angela Browser already exists. The configuration was preserved.')
}
else {
  // Save only after the runtime connects and reports browser tools.
  const client = new Client({ name: 'angela-browser-setup', version: '1.0.0' })
  const transport = new StdioClientTransport({ ...browserServerConfig, stderr: 'inherit' })
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    if (!tools.some(tool => tool.name === 'browser_navigate'))
      throw new Error('Angela Browser did not report browser navigation tools.')
    console.info(`Angela Browser connected with ${tools.length} tools.`)
  }
  finally {
    await client.close()
    await transport.close()
  }
  config.mcpServers[browserServerName] = browserServerConfig
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
  console.info(`Angela Browser added to ${path}. Apply and restart MCP in Angela settings.`)
}
