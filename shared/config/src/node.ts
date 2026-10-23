import type { LocalConfig, LocalConfigPatch, LocalConfigSnapshot, LocalConfigTransport } from './index'

import process from 'node:process'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

import * as v from 'valibot'

import { emptyLocalConfig, localConfigPatchSchema, localConfigSchema } from './index'

/** Explicit paths override ANGELA_CONFIG, then the XDG configuration directory, then the user's .config directory. */
export function resolveLocalConfigPath(path?: string, env = process.env) {
  return resolve(path ?? env.ANGELA_CONFIG ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'angela', 'config.json'))
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Owns one private JSON file. Cross-process writer locks protect patches, and atomic replacement protects readers. */
export class LocalConfigFile implements LocalConfigTransport {
  readonly path: string
  private readonly id: string

  constructor(path?: string) {
    this.path = resolveLocalConfigPath(path)
    this.id = createHash('sha256').update(this.path).digest('hex')
  }

  async read(): Promise<LocalConfigSnapshot> {
    let source: string
    try {
      source = await readFile(this.path, 'utf8')
    }
    catch (error) {
      if (hasCode(error, 'ENOENT'))
        return { id: this.id, config: null, revision: 'missing' }
      throw error
    }
    try {
      return {
        id: this.id,
        config: v.parse(localConfigSchema, JSON.parse(source)),
        revision: createHash('sha256').update(source).digest('hex'),
      }
    }
    catch {
      // Configuration can contain credentials. Parser diagnostics must not echo its source text.
      throw new Error(`Invalid local configuration: ${this.path}`)
    }
  }

  async update(input: LocalConfigPatch): Promise<LocalConfigSnapshot> {
    const patch = v.parse(localConfigPatchSchema, input)
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const lock = await this.acquireLock()
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      const previous = (await this.read()).config ?? emptyLocalConfig
      const providers = { ...previous.providers }
      for (const [id, provider] of Object.entries(patch.providers ?? emptyLocalConfig.providers)) {
        if (provider === null)
          delete providers[id]
        else
          providers[id] = provider
      }
      const config: LocalConfig = { version: 1, providers, chat: patch.chat ?? previous.chat }
      const source = `${JSON.stringify(v.parse(localConfigSchema, config), null, 2)}\n`
      await writeFile(temporary, source, { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.path)
      return { id: this.id, config, revision: createHash('sha256').update(source).digest('hex') }
    }
    finally {
      try {
        await unlink(temporary).catch((error: unknown) => {
          if (!hasCode(error, 'ENOENT'))
            throw error
        })
      }
      finally {
        await lock.close()
        await unlink(`${this.path}.lock`)
      }
    }
  }

  private async acquireLock() {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        return await open(`${this.path}.lock`, 'wx', 0o600)
      }
      catch (error) {
        if (!hasCode(error, 'EEXIST'))
          throw error
        await setTimeout(20)
      }
    }
    throw new Error(`Configuration writer is busy. Close the other writer before removing a stale lock: ${this.path}.lock`)
  }
}
