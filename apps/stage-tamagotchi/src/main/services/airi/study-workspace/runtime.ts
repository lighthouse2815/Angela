import type { StudyWorkspaceDocument, StudyWorkspaceListing, StudyWorkspaceReadRequest, StudyWorkspaceSearchResult } from '../../../../shared/eventa/study-workspace'

import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { lstat, mkdir, open, opendir, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep, win32 } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { escapeRegExp } from 'es-toolkit'
import { getResolvedPDFJS } from 'unpdf'
import { array, integer, maxLength, minLength, minValue, number, object, optional, parse, pipe, string, trim } from 'valibot'

import { readDocx } from './docx'

const pathSchema = object({ path: pipe(string(), maxLength(1024)) })
const positionSchema = pipe(number(), integer(), minValue(1))
const readSchema = object({ ...pathSchema.entries, startPage: optional(positionSchema), endPage: optional(positionSchema) })
const searchSchema = object({
  ...pathSchema.entries,
  query: pipe(string(), trim(), minLength(1), maxLength(200)),
  startPage: optional(positionSchema),
  startParagraph: optional(positionSchema),
})
const noteSchema = object({
  filename: pipe(string(), minLength(1), maxLength(120)),
  content: pipe(string(), minLength(1), maxLength(128 * 1024)),
  sources: optional(pipe(array(object({ ...pathSchema.entries, page: optional(positionSchema), paragraph: optional(positionSchema) })), maxLength(20)), () => []),
})

function isDocument(name: string) {
  return ['.md', '.markdown', '.txt', '.pdf', '.docx'].includes(extname(name).toLowerCase())
}

async function* pdfPages(data: Uint8Array, start = 1, end?: number) {
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
    if (start > (end ?? pdf.numPages) || (end !== undefined && end > pdf.numPages))
      throw new Error(`Choose an ordered PDF page range within 1–${pdf.numPages}.`)
    // Read sequentially so a document cannot fan out work across every page.
    for (let page = start; page <= (end ?? pdf.numPages); page++) {
      const documentPage = await pdf.getPage(page)
      try {
        const { items } = await documentPage.getTextContent()
        const text = items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('').trim()
        yield { page, text, totalPages: pdf.numPages }
      }
      finally {
        documentPage.cleanup()
      }
    }
  }
  finally {
    await loading.destroy()
  }
}

async function readPdf(data: Uint8Array, path: string, input: StudyWorkspaceReadRequest) {
  const start = input.startPage ?? 1
  const count = input.endPage === undefined ? 10 : input.endPage - start + 1
  if (count < 1 || count > 20)
    throw new Error('Choose an ordered range of at most 20 PDF pages.')
  const pages: { page: number, text: string }[] = []
  let totalPages = 0
  let bytes = 0
  for await (const entry of pdfPages(data, start, input.endPage)) {
    bytes += Buffer.byteLength(entry.text, 'utf8')
    if (bytes > 256 * 1024)
      throw new Error('PDF text exceeds 256 KiB. Request fewer pages.')
    totalPages = entry.totalPages
    pages.push({ page: entry.page, text: entry.text })
    if (pages.length === count)
      break
  }
  if (!pages.some(page => page.text))
    throw new Error('These PDF pages have no extractable text. Scanned pages require OCR, which is not supported.')
  return { path, totalPages, pages, truncated: start !== 1 || pages.at(-1)?.page !== totalPages }
}

function decodeText(data: Uint8Array) {
  if (data.includes(0))
    throw new Error('Learning documents must contain UTF-8 text, without binary data.')
  return new TextDecoder('utf-8', { fatal: true }).decode(data)
}

function findExcerpt(text: string, query: RegExp) {
  const normalized = text.normalize('NFC')
  const match = query.exec(normalized)
  if (!match)
    return undefined
  return {
    excerpt: normalized.slice(Math.max(0, match.index - 150), match.index + 450).trim(),
    line: normalized.slice(0, match.index).split(/\r\n|[\r\n]/u).length,
  }
}

/**
 * Owns session-only folder access. All operations finish before a folder change takes effect.
 * Reads accept UTF-8, PDF, and DOCX text. Writes create new Markdown files inside Angela Notes.
 * Source citations refer to successful reads and reset when folder access changes.
 */
export class StudyWorkspace {
  private directory: string | undefined
  private readonly mutex = new Mutex()
  /** Zero identifies a text document. Positive values identify PDF pages from successful reads. */
  private readonly readSources = new Map<string, Set<number>>()
  private readonly docxSources = new Map<string, Map<number, string | undefined>>()

  async select(directory: string) {
    return this.mutex.runExclusive(async () => {
      const canonical = await realpath(directory)
      if (!(await stat(canonical)).isDirectory())
        throw new Error('Choose a directory for learning documents.')
      this.directory = canonical
      this.readSources.clear()
      this.docxSources.clear()
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
      this.docxSources.clear()
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
    return this.mutex.runExclusive(() => this.listDirectory(path))
  }

  private async listDirectory(path: string): Promise<StudyWorkspaceListing> {
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
  }

  private async loadDocument(path: string) {
    const resolved = await this.resolvePath(path)
    if (!isDocument(resolved.target))
      throw new Error('Read a .md, .markdown, .txt, .pdf, or .docx learning document.')
    const extension = extname(resolved.target).toLowerCase()
    const pdf = extension === '.pdf'
    const docx = extension === '.docx'
    const limit = pdf || docx ? 10 * 1024 * 1024 : 256 * 1024
    const sizeLabel = pdf || docx ? '10 MiB' : '256 KiB'
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
      return { path: resolved.path, pdf, docx, data: buffer.subarray(0, length) }
    }
    finally {
      await file.close()
    }
  }

  async read(input: unknown): Promise<StudyWorkspaceDocument> {
    const request = parse(readSchema, input)
    return this.mutex.runExclusive(async () => {
      const { path, pdf, docx, data } = await this.loadDocument(request.path)
      if (!pdf && (request.startPage !== undefined || request.endPage !== undefined))
        throw new Error('Page ranges apply only to PDF documents.')
      if (docx) {
        const document = await readDocx(data, path)
        this.docxSources.set(path, new Map<number, string | undefined>(document.paragraphs.map(entry => [entry.paragraph, entry.heading])))
        return document
      }
      if (pdf) {
        const document = await readPdf(data, path, request)
        let pages = this.readSources.get(path)
        if (!pages) {
          pages = new Set<number>()
          this.readSources.set(path, pages)
        }
        for (const page of document.pages)
          pages.add(page.page)
        return document
      }
      const text = decodeText(data)
      this.readSources.set(path, new Set([0]))
      return { path, text }
    })
  }

  /** Search does not grant note citations. A document or PDF page read must precede a saved source reference. */
  async search(input: unknown): Promise<StudyWorkspaceSearchResult> {
    const request = parse(searchSchema, input)
    const query = new RegExp(request.query.normalize('NFC').split(/\s+/u).map(escapeRegExp).join('\\s+'), 'iu')
    return this.mutex.runExclusive(async () => {
      const scope = await this.resolvePath(request.path)
      const scopeInfo = await lstat(scope.target)
      const extension = extname(scope.target).toLowerCase()
      if (request.startPage !== undefined && (!scopeInfo.isFile() || extension !== '.pdf' || request.startParagraph !== undefined))
        throw new Error('Search page continuation applies only to a single PDF document.')
      if (request.startParagraph !== undefined && (!scopeInfo.isFile() || extension !== '.docx'))
        throw new Error('Search paragraph continuation applies only to a single DOCX document.')
      const queue: StudyWorkspaceSearchResult['pending'] = [{ path: scope.path, startPage: request.startPage, startParagraph: request.startParagraph }]
      const pending: StudyWorkspaceSearchResult['pending'] = []
      const matches: StudyWorkspaceSearchResult['matches'] = []
      const skipped: StudyWorkspaceSearchResult['skipped'] = []
      let searchedFiles = 0
      let searchedPages = 0
      let searchedParagraphs = 0
      let directories = 0
      let inspected = 0
      let bytes = 0
      while (queue.length && matches.length < 20 && searchedFiles < 50 && searchedPages < 100 && searchedParagraphs < 500 && directories < 50 && inspected < 200 && bytes < 2 * 1024 * 1024) {
        const task = queue.shift()!
        inspected++
        try {
          const resolved = await this.resolvePath(task.path)
          if ((await lstat(resolved.target)).isDirectory()) {
            const listing = await this.listDirectory(resolved.path)
            directories++
            if (listing.truncated)
              skipped.push({ path: resolved.path, reason: 'Directory listing reached its limit. Search a more specific directory.' })
            for (const entry of listing.entries)
              queue.push({ path: listing.path === '.' ? entry.name : `${listing.path}/${entry.name}` })
            continue
          }
          const document = await this.loadDocument(resolved.path)
          searchedFiles++
          if (document.docx) {
            const parsed = await readDocx(document.data, document.path)
            if (parsed.warnings.length)
              skipped.push({ path: document.path, reason: parsed.warnings.join(' ').slice(0, 240) })
            const start = task.startParagraph ?? 1
            if (start > parsed.paragraphs.length)
              throw new Error(`Choose a DOCX paragraph within 1–${parsed.paragraphs.length}.`)
            for (const entry of parsed.paragraphs.slice(start - 1)) {
              const size = Buffer.byteLength(entry.text, 'utf8')
              if (bytes + size > 2 * 1024 * 1024) {
                pending.push({ path: document.path, startParagraph: entry.paragraph })
                break
              }
              bytes += size
              searchedParagraphs++
              const hit = findExcerpt(entry.text, query)
              if (hit)
                matches.push({ path: document.path, paragraph: entry.paragraph, heading: entry.heading, excerpt: hit.excerpt })
              if (matches.length === 20 || searchedParagraphs === 500) {
                if (entry.paragraph < parsed.paragraphs.length)
                  pending.push({ path: document.path, startParagraph: entry.paragraph + 1 })
                break
              }
            }
          }
          else if (document.pdf) {
            let hasText = false
            for await (const entry of pdfPages(document.data, task.startPage)) {
              hasText ||= Boolean(entry.text)
              const size = Buffer.byteLength(entry.text, 'utf8')
              if (size > 2 * 1024 * 1024) {
                skipped.push({ path: document.path, reason: `PDF page ${entry.page} exceeds the 2 MiB search text limit.` })
                if (entry.page < entry.totalPages)
                  pending.push({ path: document.path, startPage: entry.page + 1 })
                break
              }
              if (bytes + size > 2 * 1024 * 1024) {
                pending.push({ path: document.path, startPage: entry.page })
                break
              }
              bytes += size
              searchedPages++
              const hit = findExcerpt(entry.text, query)
              if (hit)
                matches.push({ path: document.path, page: entry.page, excerpt: hit.excerpt })
              if (matches.length === 20 || searchedPages === 100) {
                if (entry.page < entry.totalPages)
                  pending.push({ path: document.path, startPage: entry.page + 1 })
                break
              }
            }
            if (!hasText)
              skipped.push({ path: document.path, reason: 'PDF pages have no extractable text. OCR is not supported.' })
          }
          else {
            const text = decodeText(document.data)
            if (bytes + document.data.length > 2 * 1024 * 1024) {
              pending.push({ path: document.path })
              break
            }
            bytes += document.data.length
            const hit = findExcerpt(text, query)
            if (hit)
              matches.push({ path: document.path, ...hit })
          }
        }
        catch (error) {
          skipped.push({ path: task.path, reason: (errorMessageFrom(error) ?? 'Document search failed.').slice(0, 240) })
        }
      }
      return {
        path: scope.path,
        query: request.query,
        matches,
        searchedFiles,
        searchedPages,
        searchedParagraphs,
        truncated: queue.length > 0 || pending.length > 0 || skipped.length > 0,
        pending: [...pending, ...queue].slice(0, 20),
        skipped: skipped.slice(0, 20),
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
        let position = ''
        let fragment = ''
        if (extname(resolved.target).toLowerCase() === '.docx') {
          const paragraphs = this.docxSources.get(resolved.path)
          if (source.page !== undefined || source.paragraph === undefined || !paragraphs?.has(source.paragraph))
            throw new Error('Cite only DOCX paragraphs read during the current folder selection.')
          const heading = paragraphs.get(source.paragraph)
          position = `#paragraph=${source.paragraph}`
          if (heading)
            position += ` (${heading})`
        }
        else {
          if (source.paragraph !== undefined || !this.readSources.get(resolved.path)?.has(source.page ?? 0))
            throw new Error('Cite only documents and PDF pages read during the current folder selection.')
          fragment = source.page === undefined ? '' : `#page=${source.page}`
          position = fragment
        }
        const label = `${resolved.path}${position}`.replace(/[\\[\]<>]/g, '\\$&').replace(/\p{Cc}/gu, ' ')
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
