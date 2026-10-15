import type { StudyWorkspaceListing } from '../../../../shared/eventa/study-workspace'

import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { lstat, mkdir, open, opendir, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep, win32 } from 'node:path'

import { Mutex } from 'async-mutex'
import { maxLength, minLength, object, parse, pipe, string } from 'valibot'

const pathSchema = object({ path: pipe(string(), maxLength(1024)) })
const noteSchema = object({
  filename: pipe(string(), minLength(1), maxLength(120)),
  content: pipe(string(), minLength(1), maxLength(128 * 1024)),
})

function isDocument(name: string) {
  return ['.md', '.markdown', '.txt'].includes(extname(name).toLowerCase())
}

/**
 * Owns session-only folder access. All operations finish before a folder change takes effect.
 * Reads accept UTF-8 learning documents. Writes create new Markdown files inside Angela Notes.
 */
export class StudyWorkspace {
  private directory: string | undefined
  private readonly mutex = new Mutex()

  async select(directory: string) {
    return this.mutex.runExclusive(async () => {
      const canonical = await realpath(directory)
      if (!(await stat(canonical)).isDirectory())
        throw new Error('Choose a directory for learning documents.')
      this.directory = canonical
      return this.status()
    })
  }

  status() {
    return { directory: this.directory ?? null, cancelled: false }
  }

  async clear() {
    return this.mutex.runExclusive(() => {
      this.directory = undefined
      return this.status()
    })
  }

  private requireDirectory() {
    if (!this.directory)
      throw new Error('Choose a learning directory with study_workspace_directory first.')
    return this.directory
  }

  private async resolvePath(path: string) {
    const root = this.requireDirectory()
    if (isAbsolute(path) || win32.isAbsolute(path) || path.includes('\0'))
      throw new Error('Use a relative path inside the learning directory.')
    const parts = path.split(/[\\/]/).filter(part => part && part !== '.')
    if (parts.some(part => part === '..' || part.startsWith('.') || part.includes(':')))
      throw new Error('Hidden paths and parent directory traversal are not allowed.')

    // Refuse root redirection and symbolic links in requested path components.
    if (await realpath(root) !== root)
      throw new Error('The learning directory changed. Choose it again.')
    let target = root
    for (const part of parts) {
      target = join(target, part)
      if ((await lstat(target)).isSymbolicLink())
        throw new Error('Symbolic links are not supported in learning paths.')
    }
    const canonical = await realpath(target)
    const within = relative(root, canonical)
    if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`))
      throw new Error('The path is outside the learning directory.')
    return { target: canonical, path: parts.join('/') || '.' }
  }

  async list(input: unknown): Promise<StudyWorkspaceListing> {
    const { path } = parse(pathSchema, input)
    return this.mutex.runExclusive(async () => {
      const resolved = await this.resolvePath(path)
      const entries: StudyWorkspaceListing['entries'] = []
      let scanned = 0
      let truncated = false
      const directory = await opendir(resolved.target)
      for await (const entry of directory) {
        // Bound scanning as well as returned entries for large or unrelated directories.
        if (++scanned > 1000) {
          truncated = true
          break
        }
        if (entry.name.startsWith('.') || entry.isSymbolicLink())
          continue
        if (!entry.isDirectory() && (!entry.isFile() || !isDocument(entry.name)))
          continue
        if (entries.length === 200) {
          truncated = true
          break
        }
        entries.push({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'document' })
      }
      entries.sort((a, b) => a.name.localeCompare(b.name))
      return { path: resolved.path, entries, truncated }
    })
  }

  async read(input: unknown) {
    const { path } = parse(pathSchema, input)
    return this.mutex.runExclusive(async () => {
      const resolved = await this.resolvePath(path)
      if (!isDocument(resolved.target))
        throw new Error('Read a .md, .markdown, or .txt learning document.')
      // Nonblocking open prevents a replaced document from blocking on a FIFO.
      const file = await open(resolved.target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const info = await file.stat()
        if (!info.isFile() || info.size > 256 * 1024)
          throw new Error('Learning documents must be regular files of at most 256 KiB.')
        const buffer = Buffer.alloc(256 * 1024 + 1)
        let length = 0
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, length)
          if (!bytesRead)
            break
          length += bytesRead
        }
        if (length > 256 * 1024)
          throw new Error('Learning documents must be at most 256 KiB.')
        const data = buffer.subarray(0, length)
        if (data.includes(0))
          throw new Error('Learning documents must contain UTF-8 text, without binary data.')
        const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
        return { path: resolved.path, text }
      }
      finally {
        await file.close()
      }
    })
  }

  async saveNote(input: unknown) {
    const { filename, content } = parse(noteSchema, input)
    if (!/^[^./\\:\p{Cc}][^/\\:\p{Cc}]*\.md$/iu.test(filename) || filename.includes('..') || /[. ]$/.test(filename))
      throw new Error('Use a Markdown filename without directories or hidden names.')
    const bytes = Buffer.byteLength(content, 'utf8')
    if (!content.trim() || content.includes('\0') || bytes > 128 * 1024)
      throw new Error('Notes must contain UTF-8 text of at most 128 KiB.')

    return this.mutex.runExclusive(async () => {
      const root = await this.resolvePath('.')
      await mkdir(join(root.target, 'Angela Notes'), { recursive: true })
      const notes = await this.resolvePath('Angela Notes')
      // Exclusive creation preserves existing notes, including symbolic links at the destination.
      const file = await open(join(notes.target, filename), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      try {
        await file.writeFile(content, 'utf8')
        await file.sync()
      }
      finally {
        await file.close()
      }
      return { path: `Angela Notes/${filename}`, bytes }
    })
  }
}
