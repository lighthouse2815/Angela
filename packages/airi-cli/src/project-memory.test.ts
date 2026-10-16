import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Memory } from './memory'
import { ProjectMemory } from './project-memory'

const directories: string[] = []
const sessionId = randomUUID()
const snapshot = { goal: 'Hoàn thiện CLI', status: 'active' as const, decisions: ['Dùng API hiện tại'], completed: ['Đã thêm voice'], blockers: [], nextStep: 'Thêm memory dự án' }
const options = { messages: [], toolCallId: 'project-test' }

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-project-memory-'))
  directories.push(directory)
  const workspace = join(directory, 'workspace')
  const data = join(directory, 'data')
  await mkdir(workspace)
  const project = await ProjectMemory.open(data, workspace, cliMessages.en)
  return { directory, workspace, data, project }
}

it('shares canonical Git roots across subdirectories and symlinks without changing the repository', async () => {
  const { directory, data, workspace } = await setup()
  await promisify(execFile)('git', ['init', workspace])
  const nested = join(workspace, 'src')
  await mkdir(nested)
  const alias = join(directory, 'alias')
  await symlink(nested, alias)
  const first = await ProjectMemory.open(data, workspace, cliMessages.en)
  const other = await ProjectMemory.open(data, alias, cliMessages.en)
  expect(other.workspace).toBe(first.workspace)
  await first.save(snapshot, 0, sessionId)
  expect((await other.read()).snapshot).toEqual(snapshot)
  const { stdout } = await promisify(execFile)('git', ['-C', workspace, 'status', '--porcelain'])
  expect(stdout).toBe('')
})

it('persists a checkpoint across sessions while isolating unrelated directories and personal facts', async () => {
  const { directory, workspace, data, project } = await setup()
  expect((await project.read()).snapshot).toBeNull()
  await expect(stat(join(data, 'memory'))).rejects.toThrow()
  await project.save(snapshot, 0, sessionId)
  const next = await ProjectMemory.open(data, workspace, cliMessages.en)
  expect(await next.read()).toMatchObject({ revision: 1, sourceSession: sessionId, snapshot })
  const otherRoot = join(directory, 'other')
  await mkdir(otherRoot)
  const other = await ProjectMemory.open(data, otherRoot, cliMessages.en)
  expect((await other.read()).snapshot).toBeNull()
  expect(await other.context()).not.toContain('Đã thêm voice')
  expect((await new Memory(data, cliMessages.en).read()).entries).toEqual([])
  const path = join(data, 'memory', 'projects', (await readdir(join(data, 'memory', 'projects')))[0]!)
  expect((await stat(path)).mode & 0o777).toBe(0o600)
})

it('rejects stale checkpoints from another session and returns the latest revision to the model', async () => {
  const { project, data, workspace } = await setup()
  const other = await ProjectMemory.open(data, workspace, cliMessages.en)
  const [tool] = await other.tools('Hoàn thiện CLI', sessionId, [])
  await project.save(snapshot, 0, sessionId)
  const result = await tool!.execute!({ expected_revision: 0, snapshot: { ...snapshot, goal: 'Stale goal' }, source_quote: 'Hoàn thiện CLI' }, options)
  expect(result).toMatchObject({ status: 'rejected', reason: cliMessages.en.projectMemoryChanged, checkpoint: { revision: 1, snapshot } })
  expect((await other.read()).snapshot).toEqual(snapshot)
})

it('drops resolved blockers for completed work and enforces bounded snapshots before writing', async () => {
  const { project } = await setup()
  await project.save(snapshot, 0, sessionId)
  await expect(project.save({ ...snapshot, goal: 'a'.repeat(801) }, 1, sessionId)).rejects.toThrow()
  await expect(project.save({ ...snapshot, completed: Array.from({ length: 11 }, (_, index) => `Entry ${index}`) }, 1, sessionId)).rejects.toThrow()
  expect((await project.read()).revision).toBe(1)
  await project.save({ ...snapshot, status: 'done', blockers: ['Old blocker'], nextStep: 'Old step' }, 1, sessionId)
  expect((await project.read()).snapshot).toMatchObject({ status: 'done', blockers: [], nextStep: '' })
})

it('persists its independent switch and clears only the requested checkpoint', async () => {
  const { project, data, workspace } = await setup()
  const file = join(workspace, 'keep.txt')
  await writeFile(file, 'keep')
  await new Memory(data, cliMessages.en).remember('Tôi dùng Linux')
  await project.save(snapshot, 0, sessionId)
  expect(await project.command('/project')).toContain('Đã thêm voice')
  expect(await project.command('/project off')).toBe(cliMessages.en.projectMemoryDisabled)
  expect(await project.context()).toBe('')
  expect(await project.tools('Continue', sessionId, [])).toEqual([])
  await expect(project.save(snapshot, 2, sessionId)).rejects.toThrow(cliMessages.en.projectMemoryDisabled)
  expect(await project.command('/project clear')).toBe(cliMessages.en.projectMemoryCleared)
  const state = await project.read()
  expect(state).toMatchObject({ enabled: false, revision: 3, snapshot: null, sourceSession: null })
  expect(await readFile(file, 'utf8')).toBe('keep')
  expect((await new Memory(data, cliMessages.en).read()).entries).toHaveLength(1)
  expect(await project.command('/project on')).toBe(cliMessages.en.projectMemoryEnabled)
  expect((await project.read()).revision).toBe(4)
})

it('requires evidence from this turn and rejects a cancelled save', async () => {
  const { project } = await setup()
  const observations: string[] = []
  const [tool] = await project.tools('Hoàn thiện CLI', sessionId, observations)
  expect(await tool!.execute!({ expected_revision: 0, snapshot, source_quote: 'Invented result' }, options)).toMatchObject({ status: 'rejected' })
  const controller = new AbortController()
  controller.abort()
  await expect(tool!.execute!({ expected_revision: 0, snapshot, source_quote: 'Hoàn thiện CLI' }, { ...options, abortSignal: controller.signal })).rejects.toThrow()
  observations.push('Tests passed: 5')
  expect(await tool!.execute!({ expected_revision: 0, snapshot, source_quote: 'Tests passed: 5' }, options)).toMatchObject({ status: 'saved', revision: 1 })
  expect(await project.context()).toContain('Verify current files, Git state, and tests')
})

it('preserves invalid project files and refuses a snapshot belonging to another root', async () => {
  const { project, data } = await setup()
  await project.save(snapshot, 0, sessionId)
  const path = join(data, 'memory', 'projects', (await readdir(join(data, 'memory', 'projects')))[0]!)
  const state = await project.read()
  await writeFile(path, JSON.stringify({ ...state, workspace: '/another-project' }))
  await expect(project.read()).rejects.toThrow(cliMessages.en.projectMemoryInvalid)
  await expect(project.save(snapshot, 1, sessionId)).rejects.toThrow(cliMessages.en.projectMemoryInvalid)
  await writeFile(path, '{broken')
  await expect(project.read()).rejects.toThrow(cliMessages.en.projectMemoryInvalid)
  await expect(project.save(snapshot, 1, sessionId)).rejects.toThrow(cliMessages.en.projectMemoryInvalid)
  expect(await readFile(path, 'utf8')).toBe('{broken')
})
