import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as v from 'valibot'

/** Shares private, bounded, atomic storage between memory owners. Local writes queue before acquiring the cross-process lock. */
export class MemoryFile<T> {
  private writes: Promise<void> = Promise.resolve()

  constructor(
    private readonly directory: string,
    private readonly name: string,
    private readonly schema: v.GenericSchema<unknown, T>,
    private readonly initial: () => T,
    private readonly errors: { invalid: string, locked: string },
  ) {}

  /** Missing files return defaults without writing. Invalid files remain untouched. */
  async read(): Promise<T> {
    try {
      const source = await readFile(join(this.directory, `${this.name}.json`), 'utf8')
      if (source.length > 128_000)
        throw new Error(this.errors.invalid)
      return v.parse(this.schema, JSON.parse(source))
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return this.initial()
      throw new Error(this.errors.invalid)
    }
  }

  async edit(change: (state: T) => void) {
    const pending = this.writes.then(() => this.write(change))
    this.writes = pending.then(() => {}, () => {})
    await pending
  }

  private async write(change: (state: T) => void) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const lockPath = join(this.directory, `${this.name}.lock`)
    const lock = await open(lockPath, 'wx', 0o600).catch(() => {
      throw new Error(this.errors.locked)
    })
    const temporary = join(this.directory, `${randomUUID()}.tmp`)
    try {
      const state = await this.read()
      change(state)
      const source = JSON.stringify(v.parse(this.schema, state))
      if (source.length > 128_000)
        throw new Error(this.errors.invalid)
      await writeFile(temporary, source, { flag: 'wx', mode: 0o600 })
      await rename(temporary, join(this.directory, `${this.name}.json`))
    }
    finally {
      await unlink(temporary).catch(() => {})
      await lock.close()
      await unlink(lockPath)
    }
  }
}
