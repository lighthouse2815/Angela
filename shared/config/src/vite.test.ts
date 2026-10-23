import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createServer } from 'vite'
import { expect, it } from 'vitest'

import { localConfigPlugin } from './vite'

it('serves one file to local same-origin callers and rejects cross-origin requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-config-http-'))
  const server = await createServer({ configFile: false, root: directory, plugins: [localConfigPlugin(join(directory, 'config.json'))], server: { host: '127.0.0.1', port: 0 } })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing local server address')
    const origin = `http://127.0.0.1:${address.port}`
    const endpoint = `${origin}/__angela/local-config`
    expect((await fetch(endpoint)).status).toBe(403)
    expect((await fetch(endpoint, { headers: { 'Origin': 'https://untrusted.example', 'X-Angela-Config': '1' } })).status).toBe(403)
    const update = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Origin': origin, 'X-Angela-Config': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: { provider: '', model: 'local-model' } }),
    })
    expect(update.status).toBe(200)
    const read = await fetch(endpoint, { headers: { 'Origin': origin, 'X-Angela-Config': '1' } })
    expect(read.headers.get('Cache-Control')).toBe('no-store')
    expect(read.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(await read.json()).toMatchObject({ config: { chat: { model: 'local-model' } } })
  }
  finally {
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
})
