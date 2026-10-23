import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

import { Buffer } from 'node:buffer'

import * as v from 'valibot'

import { localConfigPatchSchema } from './index'
import { LocalConfigFile } from './node'

/** Serves configuration only to same-origin, loopback callers of a local Vite server or preview server. */
export function localConfigPlugin(path?: string): Plugin {
  const store = new LocalConfigFile(path)
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/__angela/local-config') {
      next()
      return
    }
    void respond(request, response, store)
  }
  return {
    name: 'angela-local-config',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

async function respond(request: IncomingMessage, response: ServerResponse, store: LocalConfigFile) {
  response.removeHeader('Access-Control-Allow-Origin')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json')
  try {
    const host = new URL(`http://${request.headers.host}`)
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)
    const localCaller = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
    const sameOrigin = !request.headers.origin || new URL(request.headers.origin).host === host.host
    if (!localHost || !localCaller || !sameOrigin || request.headers['x-angela-config'] !== '1') {
      response.writeHead(403).end(JSON.stringify({ error: 'Local same-origin requests only' }))
      return
    }
    if (request.method === 'GET') {
      response.end(JSON.stringify(await store.read()))
      return
    }
    if (request.method !== 'PATCH' || request.headers['content-type']?.split(';')[0] !== 'application/json') {
      response.writeHead(405).end(JSON.stringify({ error: 'Use GET or JSON PATCH' }))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.byteLength
      if (size > 262_144) {
        response.writeHead(413).end(JSON.stringify({ error: 'Configuration request is too large' }))
        return
      }
      chunks.push(bytes)
    }
    const parsed = v.safeParse(localConfigPatchSchema, JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (!parsed.success) {
      response.writeHead(400).end(JSON.stringify({ error: 'Invalid configuration patch' }))
      return
    }
    response.end(JSON.stringify(await store.update(parsed.output)))
  }
  catch {
    response.writeHead(500).end(JSON.stringify({ error: 'Could not read or update local configuration' }))
  }
}
