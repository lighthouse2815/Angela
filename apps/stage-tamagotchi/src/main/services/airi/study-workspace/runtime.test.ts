import { Buffer } from 'node:buffer'
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
    await writeFile(join(root, 'book.docx'), 'Word')
    await workspace.select(root)
    await expect(workspace.read({ path: 'large.txt' })).rejects.toThrow('256 KiB')
    await expect(workspace.read({ path: 'binary.txt' })).rejects.toThrow('UTF-8 text')
    await expect(workspace.read({ path: 'invalid.txt' })).rejects.toThrow()
    await expect(workspace.read({ path: 'book.docx' })).rejects.toThrow('.md, .markdown, .txt, or .pdf')
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
