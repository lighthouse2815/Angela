import type { StudyWorkspaceDocument, StudyWorkspaceListing, StudyWorkspaceReadRequest } from '../../../../shared/eventa/study-workspace'

import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { lstat, mkdir, open, opendir, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep, win32 } from 'node:path'

import { Mutex } from 'async-mutex'
import { getResolvedPDFJS } from 'unpdf'
import { array, integer, maxLength, minLength, minValue, number, object, optional, parse, pipe, string } from 'valibot'

const pathSchema = object({ path: pipe(string(), maxLength(1024)) })
const pageSchema = pipe(number(), integer(), minValue(1))
const readSchema = object({ ...pathSchema.entries, startPage: optional(pageSchema), endPage: optional(pageSchema) })
const noteSchema = object({
  filename: pipe(string(), minLength(1), maxLength(120)),
  content: pipe(string(), minLength(1), maxLength(128 * 1024)),
  sources: optional(pipe(array(object({ ...pathSchema.entries, page: optional(pageSchema) })), maxLength(20)), () => []),
})

function isDocument(name: string) {
  return ['.md', '.markdown', '.txt', '.pdf'].includes(extname(name).toLowerCase())
}

async function readPdf(data: Uint8Array, path: string, input: StudyWorkspaceReadRequest) {
  const { getDocument } = await getResolvedPDFJS()
  const loading = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: true,
    useWasm: false,
    maxImageSize: 0,
    stopAtErrors: true,
    verbosity: 0,
  })
  try {
    const pdf = await loading.promise
    if (pdf.numPages > 1000)
      throw new Error('Learning PDFs must contain at most 1,000 pages.')
    const start = input.startPage ?? 1
    const end = input.endPage ?? Math.min(start + 9, pdf.numPages)
    if (start > end || end > pdf.numPages || end - start >= 20)
      throw new Error(`Choose an ordered range of at most 20 PDF pages within 1–${pdf.numPages}.`)
    const pages: { page: number, text: string }[] = []
    let bytes = 0
    // Read sequentially so a document cannot fan out work across every page.
    for (let page = start; page <= end; page++) {
      const documentPage = await pdf.getPage(page)
      try {
        const { items } = await documentPage.getTextContent()
        const text = items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('').trim()
        bytes += Buffer.byteLength(text, 'utf8')
        if (bytes > 256 * 1024)
          throw new Error('PDF text exceeds 256 KiB. Request fewer pages.')
        pages.push({ page, text })
      }
      finally {
        documentPage.cleanup()
      }
    }
    if (!pages.some(page => page.text))
      throw new Error('These PDF pages have no extractable text. Scanned pages require OCR, which is not supported.')
    return { path, totalPages: pdf.numPages, pages, truncated: start !== 1 || end !== pdf.numPages }
  }
  finally {
    await loading.destroy()
  }
}

/**
 * Owns session-only folder access. All operations finish before a folder change takes effect.
 * Reads accept UTF-8 documents and PDF text. Writes create new Markdown files inside Angela Notes.
 * Source citations refer to successful reads and reset when folder access changes.
 */
export class StudyWorkspace {
  private directory: string | undefined
  private readonly mutex = new Mutex()
  /** Zero identifies a text document. Positive values identify PDF pages from successful reads. */
  private readonly readSources = new Map<string, Set<number>>()

  async select(directory: string) {
    return this.mutex.runExclusive(async () => {
      const canonical = await realpath(directory)
      if (!(await stat(canonical)).isDirectory())
        throw new Error('Choose a directory for learning documents.')
      this.directory = canonical
      this.readSources.clear()
      return this.status()
    })
  }

  status() {
    return { directory: this.directory ?? null, cancelled: false }
  }

  async clear() {
    return this.mutex.runExclusive(() => {
      this.directory = undefined
      this.readSources.clear()
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

  async read(input: unknown): Promise<StudyWorkspaceDocument> {
    const request = parse(readSchema, input)
    const { path } = request
    return this.mutex.runExclusive(async () => {
      const resolved = await this.resolvePath(path)
      if (!isDocument(resolved.target))
        throw new Error('Read a .md, .markdown, .txt, or .pdf learning document.')
      const pdf = extname(resolved.target).toLowerCase() === '.pdf'
      if (!pdf && (request.startPage !== undefined || request.endPage !== undefined))
        throw new Error('Page ranges apply only to PDF documents.')
      const limit = pdf ? 10 * 1024 * 1024 : 256 * 1024
      const sizeLabel = pdf ? '10 MiB' : '256 KiB'
      // Nonblocking open prevents a replaced document from blocking on a FIFO.
      const file = await open(resolved.target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const info = await file.stat()
        if (!info.isFile() || info.size > limit)
          throw new Error(`Learning documents must be regular files of at most ${sizeLabel}.`)
        const buffer = Buffer.alloc(limit + 1)
        let length = 0
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, length)
          if (!bytesRead)
            break
          length += bytesRead
        }
        if (length > limit)
          throw new Error(`Learning documents must be at most ${sizeLabel}.`)
        const data = buffer.subarray(0, length)
        if (pdf) {
          const document = await readPdf(data, resolved.path, request)
          let pages = this.readSources.get(resolved.path)
          if (!pages) {
            pages = new Set<number>()
            this.readSources.set(resolved.path, pages)
          }
          for (const page of document.pages)
            pages.add(page.page)
          return document
        }
        if (data.includes(0))
          throw new Error('Learning documents must contain UTF-8 text, without binary data.')
        const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
        this.readSources.set(resolved.path, new Set([0]))
        return { path: resolved.path, text }
      }
      finally {
        await file.close()
      }
    })
  }

  async saveNote(input: unknown) {
    const { filename, content, sources } = parse(noteSchema, input)
    if (!/^[^./\\:\p{Cc}][^/\\:\p{Cc}]*\.md$/iu.test(filename) || filename.includes('..') || /[. ]$/.test(filename))
      throw new Error('Use a Markdown filename without directories or hidden names.')
    if (!content.trim() || content.includes('\0') || Buffer.byteLength(content, 'utf8') > 128 * 1024)
      throw new Error('Notes must contain UTF-8 text of at most 128 KiB.')

    return this.mutex.runExclusive(async () => {
      const root = await this.resolvePath('.')
      const citations: string[] = []
      for (const source of sources) {
        const resolved = await this.resolvePath(source.path)
        if (!this.readSources.get(resolved.path)?.has(source.page ?? 0))
          throw new Error('Cite only documents and PDF pages read during the current folder selection.')
        const fragment = source.page === undefined ? '' : `#page=${source.page}`
        const label = `${resolved.path}${fragment}`.replace(/[\\[\]<>]/g, '\\$&').replace(/[\r\n]/g, ' ')
        const url = resolved.path.split('/').map(encodeURIComponent).join('/')
        citations.push(`- [${label}](<../${url}${fragment}>)`)
      }
      const note = citations.length ? `${content}\n\n---\n\n${[...new Set(citations)].join('\n')}\n` : content
      const bytes = Buffer.byteLength(note, 'utf8')
      if (bytes > 128 * 1024)
        throw new Error('Notes, including source citations, must contain at most 128 KiB.')
      await mkdir(join(root.target, 'Angela Notes'), { recursive: true })
      const notes = await this.resolvePath('Angela Notes')
      // Exclusive creation preserves existing notes, including symbolic links at the destination.
      const file = await open(join(notes.target, filename), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      try {
        await file.writeFile(note, 'utf8')
        await file.sync()
      }
      finally {
        await file.close()
      }
      return { path: `Angela Notes/${filename}`, bytes }
    })
  }
}
