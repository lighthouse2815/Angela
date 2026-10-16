import type { cliMessages } from '@proj-airi/i18n/cli'
import type { Tool } from '@xsai/shared-chat'

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { parseDocument, stringify } from 'yaml'

import * as v from 'valibot'

import { MemoryFile } from './memory-file'

const nameSchema = v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), v.maxLength(64))
const headerSchema = v.object({ name: nameSchema, description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1024)) })
const stateSchema = v.object({ enabled: v.boolean(), disabled: v.array(nameSchema) })
const saveSchema = v.object({
  name: nameSchema,
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1024)),
  instructions: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(12_000)),
  expected_version: v.nullable(v.string()),
  verification_quote: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
})

/** Owns trusted user-managed skill files. Project files never become executable guidance merely because a directory was opened. */
export class Skills {
  readonly directory: string
  private readonly settings: MemoryFile<v.InferOutput<typeof stateSchema>>

  constructor(dataDir: string, private readonly messages: typeof cliMessages.en) {
    this.directory = join(dataDir, 'memory', 'skills')
    this.settings = new MemoryFile(join(dataDir, 'memory'), 'skills-settings', stateSchema, () => ({ enabled: true, disabled: [] }), { invalid: messages.skillsInvalid, locked: messages.memoryLocked })
  }

  async list() {
    const settings = await this.settings.read()
    let names: string[]
    try {
      names = await readdir(this.directory)
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return []
      throw error
    }
    const skills: { name: string, description: string, instructions: string, version: string, enabled: boolean }[] = []
    for (const name of names.sort()) {
      if (!v.safeParse(nameSchema, name).success)
        continue
      try {
        const path = join(this.directory, name, 'SKILL.md')
        const root = await realpath(this.directory)
        const file = await realpath(path)
        const location = relative(root, file)
        if (location.startsWith(`..${sep}`) || location === '..' || resolve(root, location) !== file || !(await lstat(file)).isFile())
          throw new Error(this.messages.skillsInvalid)
        const source = await readFile(file, 'utf8')
        if (source.length > 16_000)
          throw new Error(this.messages.skillsInvalid)
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(source)
        if (!match)
          throw new Error(this.messages.skillsInvalid)
        const document = parseDocument(match[1]!, { uniqueKeys: true })
        if (document.errors.length)
          throw new Error(this.messages.skillsInvalid)
        const header = v.parse(headerSchema, document.toJS({ maxAliasCount: 0 }))
        if (header.name !== name || !match[2]!.trim() || match[2]!.length > 12_000)
          throw new Error(this.messages.skillsInvalid)
        skills.push({ ...header, instructions: match[2]!.trim(), version: createHash('sha256').update(source).digest('hex'), enabled: settings.enabled && !settings.disabled.includes(name) })
      }
      catch {
        // Invalid skills fail visibly instead of silently changing the available workflow catalog.
        throw new Error(`${this.messages.skillsInvalid}: ${name}`)
      }
    }
    return skills
  }

  async read(name: string) {
    const skill = (await this.list()).find(skill => skill.name === name && skill.enabled)
    if (!skill)
      throw new Error(this.messages.skillsMissing)
    return skill
  }

  /** Imports explicitly selected documents into the trusted store. No scripts or dependencies are installed. */
  async import(path: string) {
    const source = await readFile(path, 'utf8')
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(source)
    if (!match || source.length > 16_000)
      throw new Error(this.messages.skillsInvalid)
    const document = parseDocument(match[1]!)
    if (document.errors.length)
      throw new Error(this.messages.skillsInvalid)
    const header = v.parse(headerSchema, document.toJS({ maxAliasCount: 0 }))
    await this.save({ ...header, instructions: match[2]!, verification_quote: this.messages.skillsImported, expected_version: null })
    return header.name
  }

  /** Writes one skill atomically under an exclusive lock. Version checks prevent overwriting a workflow changed by another session. */
  async save(input: v.InferOutput<typeof saveSchema>) {
    const skill = v.parse(saveSchema, input)
    const directory = join(this.directory, skill.name)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const root = await realpath(this.directory)
    if (await realpath(directory) !== join(root, skill.name))
      throw new Error(this.messages.skillsInvalid)
    const lockPath = join(directory, 'SKILL.lock')
    const lock = await open(lockPath, 'wx', 0o600).catch(() => {
      throw new Error(this.messages.memoryLocked)
    })
    const temporary = join(directory, `${randomUUID()}.tmp`)
    try {
      let version: string | null = null
      try {
        version = createHash('sha256').update(await readFile(join(directory, 'SKILL.md'), 'utf8')).digest('hex')
      }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
          throw error
      }
      if (version !== skill.expected_version)
        throw new Error(this.messages.memoryChanged)
      const header = { name: skill.name, description: skill.description, verification: { quote: skill.verification_quote, updatedAt: new Date().toISOString() } }
      await writeFile(temporary, `---\n${stringify(header)}---\n${skill.instructions}\n`, { mode: 0o600, flag: 'wx' })
      await rename(temporary, join(directory, 'SKILL.md'))
    }
    finally {
      await unlink(temporary).catch(() => {})
      await lock.close()
      await unlink(lockPath)
    }
  }

  tools(userText: string, observations: readonly string[], onChange: () => Promise<void>): Tool[] {
    return [{
      type: 'function',
      function: {
        name: 'skill_save',
        description: 'Save a reusable verified workflow as a skill. Include when to use it, steps, pitfalls and verification. Quote an observed successful MCP outcome or explicit user confirmation. Never treat a plan or model answer as proof.',
        parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, instructions: { type: 'string' }, verification_quote: { type: 'string' }, expected_version: { type: ['string', 'null'], description: 'Version returned by skill read for updates. Null for new skills.' } }, required: ['name', 'description', 'instructions', 'verification_quote', 'expected_version'], additionalProperties: false },
      },
      execute: async (input, options) => {
        const parsed = v.safeParse(saveSchema, input)
        if (!parsed.success)
          return { status: 'rejected', reason: this.messages.skillsUsage }
        if (!userText.includes(parsed.output.verification_quote) && !observations.some(observation => observation.includes(parsed.output.verification_quote)))
          return { status: 'rejected', reason: this.messages.memoryEvidence }
        if (!(await this.settings.read()).enabled)
          return { status: 'rejected', reason: this.messages.skillsMissing }
        options.abortSignal?.throwIfAborted()
        try {
          await this.save(parsed.output)
          await onChange()
          return { status: 'saved', name: parsed.output.name }
        }
        catch (error) {
          return { status: 'rejected', reason: errorMessageFrom(error) ?? this.messages.skillsInvalid }
        }
      },
    }]
  }

  async command(text: string): Promise<string | undefined> {
    if (text === '/skills')
      return `${JSON.stringify((await this.list()).map(({ name, description, enabled }) => ({ name, description, enabled })), null, 2)}\n${this.messages.skillsUsage}`
    if (text.startsWith('/skills show '))
      return JSON.stringify(await this.read(text.slice(13).trim()), null, 2)
    if (text.startsWith('/skills import '))
      return `${this.messages.memorySaved}: ${await this.import(text.slice(15).trim())}`
    const toggle = /^\/skills (on|off)(?: ([a-z0-9-]+))?$/u.exec(text)
    if (toggle) {
      const name = toggle[2]
      if (name && !(await this.list()).some(skill => skill.name === name))
        throw new Error(this.messages.skillsMissing)
      await this.settings.edit((state) => {
        if (!name)
          state.enabled = toggle[1] === 'on'
        else
          state.disabled = toggle[1] === 'on' ? state.disabled.filter(item => item !== name) : [...new Set([...state.disabled, name])]
      })
      return this.messages.skillsChanged
    }
    if (/^\/skills(?:\s|$)/u.test(text))
      return this.messages.skillsUsage
    return undefined
  }
}
