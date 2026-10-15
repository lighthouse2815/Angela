import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
    expect(result.entries).toHaveLength(3)
    expect(result.entries).toEqual(expect.arrayContaining([
      { name: 'Python', kind: 'directory' },
      { name: 'loops.md', kind: 'document' },
      { name: 'notes.TXT', kind: 'document' },
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
    await writeFile(join(root, 'book.pdf'), 'PDF')
    await workspace.select(root)
    await expect(workspace.read({ path: 'large.txt' })).rejects.toThrow('256 KiB')
    await expect(workspace.read({ path: 'binary.txt' })).rejects.toThrow('UTF-8 text')
    await expect(workspace.read({ path: 'invalid.txt' })).rejects.toThrow()
    await expect(workspace.read({ path: 'book.pdf' })).rejects.toThrow('.md, .markdown, or .txt')
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
