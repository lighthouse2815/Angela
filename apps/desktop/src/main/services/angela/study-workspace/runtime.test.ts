import { Buffer } from 'node:buffer'
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import JSZip from 'jszip'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { StudyWorkspace } from './runtime'

let directory: string
let root: string
let workspace: StudyWorkspace

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'angela-study-'))
  root = join(directory, 'learning')
  await mkdir(root)
  workspace = new StudyWorkspace()
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('study workspace access', () => {
  it('requires a user-selected directory and forgets it when cleared or restarted', async () => {
    expect(workspace.status().directory).toBeNull()
    await expect(workspace.read({ path: 'python.md' })).rejects.toThrow('Choose a learning directory')
    await workspace.select(root)
    expect(workspace.status().directory).toBe(await realpath(root))
    expect(new StudyWorkspace().status().directory).toBeNull()
    await workspace.clear()
    await expect(workspace.list({ path: '.' })).rejects.toThrow('Choose a learning directory')
    await expect(workspace.saveNote({ filename: 'note.md', content: 'Loops' })).rejects.toThrow('Choose a learning directory')
  })

  it('lists supported documents and directories without hidden files or links', async () => {
    await mkdir(join(root, 'Python'))
    await writeFile(join(root, 'loops.md'), '# Loops')
    await writeFile(join(root, 'notes.TXT'), 'Notes')
    await writeFile(join(root, '.private.md'), 'Private')
    await writeFile(join(root, 'book.pdf'), 'PDF')
    await symlink(join(root, 'loops.md'), join(root, 'link.md'))
    await workspace.select(root)
    const result = await workspace.list({ path: '.' })
    expect(result.entries).toHaveLength(4)
    expect(result.entries).toEqual(expect.arrayContaining([
      { name: 'Python', kind: 'directory' },
      { name: 'loops.md', kind: 'document' },
      { name: 'notes.TXT', kind: 'document' },
      { name: 'book.pdf', kind: 'document' },
    ]))
    expect(result.truncated).toBe(false)
  })

  it('reads Vietnamese documents and preserves the relative source path', async () => {
    await mkdir(join(root, 'Python'))
    await writeFile(join(root, 'Python', 'vòng-lặp.md'), '# Vòng lặp\nDùng for để duyệt danh sách.')
    await workspace.select(root)
    expect(await workspace.read({ path: 'Python/vòng-lặp.md' })).toEqual({
      path: 'Python/vòng-lặp.md',
      text: '# Vòng lặp\nDùng for để duyệt danh sách.',
    })
  })

  it.each(['../outside.md', '/tmp/outside.md', 'C:\\outside.md', '..\\outside.md', '.env', 'Python/../loops.md'])('rejects unauthorized path %s', async (path) => {
    await workspace.select(root)
    await expect(workspace.read({ path })).rejects.toThrow()
    await expect(workspace.search({ path, query: 'Private' })).rejects.toThrow()
  })

  it('refuses symbolic links to outside documents and directories', async () => {
    await writeFile(join(directory, 'outside.md'), 'Outside data')
    await symlink(join(directory, 'outside.md'), join(root, 'link.md'))
    await symlink(directory, join(root, 'escape'))
    await workspace.select(root)
    await expect(workspace.read({ path: 'link.md' })).rejects.toThrow('Symbolic links')
    await expect(workspace.list({ path: 'escape' })).rejects.toThrow('Symbolic links')
    await expect(workspace.read({ path: 'escape/outside.md' })).rejects.toThrow('Symbolic links')
  })

  it('rejects oversized files, binary text, invalid UTF-8, and unsupported formats', async () => {
    await writeFile(join(root, 'large.txt'), Buffer.alloc(256 * 1024 + 1, 65))
    await writeFile(join(root, 'binary.txt'), Buffer.from([65, 0, 66]))
    await writeFile(join(root, 'invalid.txt'), Buffer.from([255, 254]))
    await writeFile(join(root, 'book.doc'), 'Legacy Word')
    await workspace.select(root)
    await expect(workspace.read({ path: 'large.txt' })).rejects.toThrow('256 KiB')
    await expect(workspace.read({ path: 'binary.txt' })).rejects.toThrow('UTF-8 text')
    await expect(workspace.read({ path: 'invalid.txt' })).rejects.toThrow()
    await expect(workspace.read({ path: 'book.doc' })).rejects.toThrow('.md, .markdown, .txt, .pdf, or .docx')
  })

  it('marks a bounded listing as truncated', async () => {
    for (let index = 0; index < 201; index++)
      await writeFile(join(root, `lesson-${index}.md`), 'Lesson')
    await workspace.select(root)
    const result = await workspace.list({ path: '.' })
    expect(result.entries).toHaveLength(200)
    expect(result.truncated).toBe(true)
  })
})

describe('study workspace PDFs', () => {
  beforeEach(async () => {
    await copyFile(new URL('./fixtures/lesson.pdf', import.meta.url), join(root, 'lesson.pdf'))
    await workspace.select(root)
  })

  it('extracts Vietnamese text with physical page numbers and marks partial reads', async () => {
    const result = await workspace.read({ path: 'lesson.pdf' })
    expect(result).toMatchObject({ path: 'lesson.pdf', totalPages: 12, truncated: true })
    expect('pages' in result).toBe(true)
    if (!('pages' in result))
      throw new Error('Expected PDF pages')
    expect(result.pages).toHaveLength(10)
    expect(result.pages[0]).toEqual({ page: 1, text: 'Vòng lặp Python: dùng for để duyệt danh sách.' })
    expect(result.pages[9]).toEqual({ page: 10, text: 'Lesson page 10' })
    expect(await workspace.read({ path: 'lesson.pdf', startPage: 11 })).toEqual({
      path: 'lesson.pdf',
      totalPages: 12,
      pages: [{ page: 11, text: 'Lesson page 11' }, { page: 12, text: '' }],
      truncated: true,
    })
    expect(await workspace.read({ path: 'lesson.pdf', startPage: 1, endPage: 12 })).toMatchObject({ truncated: false })
  })

  it.each([
    { startPage: 0 },
    { startPage: 1.5 },
    { startPage: 13 },
    { startPage: 3, endPage: 2 },
    { startPage: 1, endPage: 21 },
  ])('rejects an invalid PDF range %j', async (range) => {
    await expect(workspace.read({ path: 'lesson.pdf', ...range })).rejects.toThrow()
  })

  it('reports pages without text, corrupt PDFs, and oversized PDFs', async () => {
    await expect(workspace.read({ path: 'lesson.pdf', startPage: 12, endPage: 12 })).rejects.toThrow('OCR')
    await writeFile(join(root, 'broken.pdf'), 'Invalid PDF')
    await expect(workspace.read({ path: 'broken.pdf' })).rejects.toThrow()
    await writeFile(join(root, 'large.pdf'), Buffer.alloc(10 * 1024 * 1024 + 1))
    await expect(workspace.read({ path: 'large.pdf' })).rejects.toThrow('10 MiB')
  })

  it('saves source links for read pages and rejects unread or expired citations', async () => {
    await workspace.read({ path: 'lesson.pdf', startPage: 1, endPage: 1 })
    const note = { filename: 'summary.md', content: '# Ôn tập', sources: [{ path: 'lesson.pdf', page: 2 }] }
    await expect(workspace.saveNote(note)).rejects.toThrow('Cite only')
    await workspace.read({ path: 'lesson.pdf', startPage: 2, endPage: 2 })
    const result = await workspace.saveNote({ ...note, sources: [{ path: 'lesson.pdf', page: 1 }, ...note.sources] })
    const content = await readFile(join(root, result.path), 'utf8')
    expect(content).toContain('[lesson.pdf#page=1](<../lesson.pdf#page=1>)')
    expect(content).toContain('[lesson.pdf#page=2](<../lesson.pdf#page=2>)')
    expect(result.bytes).toBe(Buffer.byteLength(content, 'utf8'))
    await workspace.clear()
    await workspace.select(root)
    await expect(workspace.saveNote({ ...note, filename: 'expired.md' })).rejects.toThrow('Cite only')
  })
})

describe('study workspace DOCX', () => {
  beforeEach(async () => {
    await copyFile(new URL('./fixtures/lesson.docx', import.meta.url), join(root, 'lesson.docx'))
    await workspace.select(root)
  })

  it('reads Vietnamese body paragraphs, headings, and table cells without header or footer text', async () => {
    expect((await workspace.list({ path: '.' })).entries).toEqual([{ name: 'lesson.docx', kind: 'document' }])
    const result = await workspace.read({ path: 'lesson.docx' })
    expect(result).toMatchObject({ path: 'lesson.docx', format: 'docx', warnings: [] })
    if (!('paragraphs' in result))
      throw new Error('Expected DOCX paragraphs')
    expect(result.paragraphs).toEqual([
      { paragraph: 1, text: 'Python cơ bản', heading: 'Python cơ bản', headingLevel: 1 },
      { paragraph: 2, text: 'Vòng lặp for giúp duyệt danh sách.', heading: 'Python cơ bản' },
      { paragraph: 3, text: 'Vòng lặp', heading: 'Vòng lặp', headingLevel: 2 },
      { paragraph: 4, text: 'Dùng while khi cần lặp theo điều kiện.', heading: 'Vòng lặp' },
      { paragraph: 5, text: 'Biến', heading: 'Vòng lặp' },
      { paragraph: 6, text: 'Giá trị', heading: 'Vòng lặp' },
      { paragraph: 7, text: 'Hàm range(3)\ntạo ba giá trị.', heading: 'Vòng lặp' },
    ])
    await expect(workspace.read({ path: 'lesson.docx', startPage: 1 })).rejects.toThrow('only to PDF')
  })

  it('searches paragraphs with source headings and supports paragraph continuation', async () => {
    const result = await workspace.search({ path: '.', query: 'vòng lặp' })
    expect(result.matches).toEqual([
      { path: 'lesson.docx', paragraph: 2, heading: 'Python cơ bản', excerpt: 'Vòng lặp for giúp duyệt danh sách.' },
      { path: 'lesson.docx', paragraph: 3, heading: 'Vòng lặp', excerpt: 'Vòng lặp' },
    ])
    expect(result.searchedParagraphs).toBe(7)
    expect(result.truncated).toBe(false)
    const rest = await workspace.search({ path: 'lesson.docx', query: 'vòng lặp', startParagraph: 3 })
    expect(rest.matches).toEqual([{ path: 'lesson.docx', paragraph: 3, heading: 'Vòng lặp', excerpt: 'Vòng lặp' }])
    await expect(workspace.search({ path: '.', query: 'Python', startParagraph: 1 })).rejects.toThrow('single DOCX')
    await expect(workspace.search({ path: 'lesson.docx', query: 'Python', startPage: 1 })).rejects.toThrow('single PDF')
  })

  it('resumes after DOCX match and paragraph limits', async () => {
    await copyFile(new URL('./fixtures/many-paragraphs.docx', import.meta.url), join(root, 'many.docx'))
    const hits = await workspace.search({ path: 'many.docx', query: 'Lesson' })
    expect(hits.matches).toHaveLength(20)
    expect(hits.pending).toEqual([{ path: 'many.docx', startParagraph: 21 }])
    const first = await workspace.search({ path: 'many.docx', query: 'Absent phrase' })
    expect(first.searchedParagraphs).toBe(500)
    expect(first.pending).toEqual([{ path: 'many.docx', startParagraph: 501 }])
    expect(first.truncated).toBe(true)
    const last = await workspace.search({ ...first.pending[0], query: 'Lesson 501' })
    expect(last.matches).toEqual([{ path: 'many.docx', paragraph: 501, heading: undefined, excerpt: 'Lesson 501' }])
    expect(last.truncated).toBe(false)
  })

  it('saves recorded paragraph headings only after a read and rejects wrong or expired positions', async () => {
    await workspace.search({ path: 'lesson.docx', query: 'while' })
    const note = { filename: 'summary.md', content: '# Ôn tập', sources: [{ path: 'lesson.docx', paragraph: 4 }] }
    await expect(workspace.saveNote(note)).rejects.toThrow('Cite only DOCX')
    await workspace.read({ path: 'lesson.docx' })
    const result = await workspace.saveNote(note)
    const saved = await readFile(join(root, result.path), 'utf8')
    expect(saved).toContain('[lesson.docx#paragraph=4 (Vòng lặp)](<../lesson.docx>)')
    expect(saved).not.toContain('../lesson.docx#paragraph=')
    expect(result.bytes).toBe(Buffer.byteLength(saved, 'utf8'))
    await expect(workspace.saveNote({ ...note, sources: [{ path: 'lesson.docx', paragraph: 8 }] })).rejects.toThrow('Cite only DOCX')
    await expect(workspace.saveNote({ ...note, sources: [{ path: 'lesson.docx', page: 4 }] })).rejects.toThrow('Cite only DOCX')
    await workspace.clear()
    await workspace.select(root)
    await expect(workspace.saveNote(note)).rejects.toThrow('Cite only DOCX')
  })

  it('rejects malformed packages and excessive archive expansion', async () => {
    await writeFile(join(root, 'broken.docx'), 'Not a DOCX')
    await expect(workspace.read({ path: 'broken.docx' })).rejects.toThrow()
    const archive = await JSZip.loadAsync(await readFile(join(root, 'lesson.docx')))
    archive.file('padding.bin', Buffer.alloc(20 * 1024 * 1024))
    await writeFile(join(root, 'expanded.docx'), await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
    await expect(workspace.read({ path: 'expanded.docx' })).rejects.toThrow('20 MiB')
  })
})

describe('study workspace search', () => {
  it('requires folder access and rejects invalid queries and page continuation', async () => {
    await expect(workspace.search({ path: '.', query: 'Python' })).rejects.toThrow('Choose a learning directory')
    await workspace.select(root)
    await expect(workspace.search({ path: '.', query: '   ' })).rejects.toThrow()
    await expect(workspace.search({ path: '.', query: 'a'.repeat(201) })).rejects.toThrow()
    await expect(workspace.search({ path: '.', query: 'Python', startPage: 1 })).rejects.toThrow('single PDF')
    await writeFile(join(root, 'lesson.txt'), 'Python')
    await expect(workspace.search({ path: 'lesson.txt', query: 'Python', startPage: 1 })).rejects.toThrow('single PDF')
    await workspace.clear()
    await expect(workspace.search({ path: '.', query: 'Python' })).rejects.toThrow('Choose a learning directory')
  })

  it('finds phrases across lines and recursively returns text lines and PDF pages', async () => {
    await mkdir(join(root, 'Python'))
    await writeFile(join(root, 'Python', 'notes.md'), '# Python\nVÒNG\r\nLẶP dùng for.'.normalize('NFD'))
    await writeFile(join(root, 'notes.TXT'), 'Ôn vòng lặp')
    await copyFile(new URL('./fixtures/lesson.pdf', import.meta.url), join(root, 'lesson.pdf'))
    await workspace.select(root)
    const result = await workspace.search({ path: '.', query: 'vòng lặp' })
    expect(result.matches).toEqual(expect.arrayContaining([
      { path: 'Python/notes.md', line: 2, excerpt: '# Python\nVÒNG\r\nLẶP dùng for.' },
      { path: 'notes.TXT', line: 1, excerpt: 'Ôn vòng lặp' },
      { path: 'lesson.pdf', page: 1, excerpt: 'Vòng lặp Python: dùng for để duyệt danh sách.' },
    ]))
    expect(result.matches).toHaveLength(3)
    expect(result.searchedFiles).toBe(3)
    expect(result.searchedPages).toBe(12)
    expect(result.truncated).toBe(false)
    expect(result.pending).toEqual([])
    expect(result.skipped).toEqual([])
    const late = await workspace.search({ path: 'lesson.pdf', query: 'lesson page 11' })
    expect(late.matches).toEqual([{ path: 'lesson.pdf', page: 11, excerpt: 'Lesson page 11' }])
  })

  it('treats regular expression syntax as literal text and bounds excerpts', async () => {
    await writeFile(join(root, 'lesson.txt'), `${'a'.repeat(1000)}\n[a+b].\n${'b'.repeat(1000)}`)
    await workspace.select(root)
    const result = await workspace.search({ path: 'lesson.txt', query: '[a+b].' })
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.line).toBe(2)
    expect(result.matches[0]?.excerpt).toContain('[a+b].')
    expect(result.matches[0]?.excerpt.length).toBeLessThanOrEqual(600)
  })

  it('excludes hidden paths and symbolic links without reading outside the selection', async () => {
    await mkdir(join(root, '.private'))
    await writeFile(join(root, '.private', 'lesson.md'), 'Secret')
    await writeFile(join(root, '.secret.txt'), 'Secret')
    await writeFile(join(directory, 'outside.txt'), 'Secret')
    await symlink(join(directory, 'outside.txt'), join(root, 'link.txt'))
    await symlink(directory, join(root, 'outside'))
    await workspace.select(root)
    const result = await workspace.search({ path: '.', query: 'Secret' })
    expect(result.matches).toEqual([])
    expect(result.searchedFiles).toBe(0)
    expect(result.truncated).toBe(false)
    await expect(workspace.search({ path: 'link.txt', query: 'Secret' })).rejects.toThrow('Symbolic links')
  })

  it('reports unreadable documents as incomplete while retaining valid matches', async () => {
    await writeFile(join(root, 'broken.pdf'), 'Invalid PDF')
    await writeFile(join(root, 'large.txt'), Buffer.alloc(256 * 1024 + 1))
    await writeFile(join(root, 'notes.md'), 'Read Python')
    await workspace.select(root)
    const result = await workspace.search({ path: '.', query: 'Python' })
    expect(result.matches).toEqual([{ path: 'notes.md', line: 1, excerpt: 'Read Python' }])
    expect(result.truncated).toBe(true)
    expect(result.skipped.map(entry => entry.path)).toEqual(['broken.pdf', 'large.txt'])
  })

  it('returns remaining scopes when the match limit stops a directory search', async () => {
    for (let index = 0; index < 21; index++)
      await writeFile(join(root, `lesson-${String(index).padStart(2, '0')}.txt`), 'Python loops')
    await workspace.select(root)
    const result = await workspace.search({ path: '.', query: 'loops' })
    expect(result.matches).toHaveLength(20)
    expect(result.truncated).toBe(true)
    expect(result.pending).toEqual([{ path: 'lesson-20.txt' }])
    const rest = await workspace.search({ ...result.pending[0], query: 'loops' })
    expect(rest.matches).toEqual([{ path: 'lesson-20.txt', line: 1, excerpt: 'Python loops' }])
    expect(rest.truncated).toBe(false)
  })

  it('continues at the next physical page after the PDF page budget', async () => {
    for (let index = 0; index < 9; index++)
      await copyFile(new URL('./fixtures/lesson.pdf', import.meta.url), join(root, `lesson-${index}.pdf`))
    await workspace.select(root)
    const result = await workspace.search({ path: '.', query: 'Absent phrase' })
    expect(result.matches).toEqual([])
    expect(result.searchedPages).toBe(100)
    expect(result.truncated).toBe(true)
    expect(result.pending).toEqual([{ path: 'lesson-8.pdf', startPage: 5 }])
    const rest = await workspace.search({ ...result.pending[0], query: 'Absent phrase' })
    expect(rest.searchedPages).toBe(8)
    expect(rest.truncated).toBe(false)
  })

  it('requires an explicit read before search hits become note citations', async () => {
    await copyFile(new URL('./fixtures/lesson.pdf', import.meta.url), join(root, 'lesson.pdf'))
    await workspace.select(root)
    await workspace.search({ path: 'lesson.pdf', query: 'Lesson page 11' })
    const note = { filename: 'summary.md', content: '# Lesson', sources: [{ path: 'lesson.pdf', page: 11 }] }
    await expect(workspace.saveNote(note)).rejects.toThrow('Cite only')
    await workspace.read({ path: 'lesson.pdf', startPage: 11, endPage: 11 })
    const saved = await workspace.saveNote(note)
    expect(await readFile(join(root, saved.path), 'utf8')).toContain('[lesson.pdf#page=11]')
  })
})

describe('study workspace notes', () => {
  it('saves actual Markdown under Angela Notes and refuses to overwrite it', async () => {
    await workspace.select(root)
    const content = '# Ôn vòng lặp\n\nNguồn: Python/vòng-lặp.md\n\n- Ôn for và while.'
    const result = await workspace.saveNote({ filename: 'ôn-vòng-lặp.md', content })
    expect(result).toEqual({ path: 'Angela Notes/ôn-vòng-lặp.md', bytes: Buffer.byteLength(content) })
    expect(await readFile(join(root, result.path), 'utf8')).toBe(content)
    await expect(workspace.saveNote({ filename: 'ôn-vòng-lặp.md', content: 'Replacement' })).rejects.toThrow('EEXIST')
    expect(await readFile(join(root, result.path), 'utf8')).toBe(content)
  })

  it.each(['../escape.md', 'sub/note.md', 'sub\\note.md', '.hidden.md', 'note.txt', 'note.md\n'])('rejects note filename %s', async (filename) => {
    await workspace.select(root)
    await expect(workspace.saveNote({ filename, content: 'Note' })).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  })

  it('refuses a redirected note directory and preserves files outside the workspace', async () => {
    await symlink(directory, join(root, 'Angela Notes'))
    await workspace.select(root)
    await expect(workspace.saveNote({ filename: 'escape.md', content: 'Note' })).rejects.toThrow('Symbolic links')
    expect(await readdir(directory)).toEqual(['learning'])
  })

  it('refuses an existing symbolic link at the note destination', async () => {
    await mkdir(join(root, 'Angela Notes'))
    await writeFile(join(directory, 'outside.md'), 'Preserve')
    await symlink(join(directory, 'outside.md'), join(root, 'Angela Notes', 'note.md'))
    await workspace.select(root)
    await expect(workspace.saveNote({ filename: 'note.md', content: 'Replacement' })).rejects.toThrow()
    expect(await readFile(join(directory, 'outside.md'), 'utf8')).toBe('Preserve')
  })

  it('enforces note limits in UTF-8 bytes and rejects blank content', async () => {
    await workspace.select(root)
    await expect(workspace.saveNote({ filename: 'note.md', content: 'ơ'.repeat(100000) })).rejects.toThrow('128 KiB')
    await expect(workspace.saveNote({ filename: 'note.md', content: '   ' })).rejects.toThrow('UTF-8 text')
    expect(await readdir(root)).toEqual([])
  })
})
