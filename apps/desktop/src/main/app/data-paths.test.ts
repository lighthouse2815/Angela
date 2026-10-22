import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { configureDataPaths } from './data-paths'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('application data paths', () => {
  it('creates the profile before assigning Electron data paths on first launch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'angela-profile-'))
    roots.push(root)
    const paths: Record<string, string> = { appData: root, userData: join(root, 'Angela'), sessionData: join(root, 'Angela') }
    const app = {
      isPackaged: true,
      getPath: (name: string) => paths[name],
      setPath: (name: string, value: string) => {
        if (!existsSync(value))
          throw new Error('Electron requires an existing data directory')
        paths[name] = value
      },
    }

    configureDataPaths(app)

    await writeFile(join(paths.userData, 'character.json'), '{"name":"Angela"}')
    expect(JSON.parse(await readFile(join(paths.sessionData, 'character.json'), 'utf8'))).toEqual({ name: 'Angela' })
  })

  it.each([
    { packaged: true, profile: 'AIRI' },
    { packaged: false, profile: '@proj-airi/stage-tamagotchi' },
  ])('reads existing character data after rebranding (packaged: $packaged)', async ({ packaged, profile }) => {
    const root = await mkdtemp(join(tmpdir(), 'angela-profile-'))
    roots.push(root)
    await mkdir(join(root, profile), { recursive: true })
    await writeFile(join(root, profile, 'character.json'), '{"name":"My character"}')
    const paths: Record<string, string> = { appData: root, userData: join(root, 'Angela'), sessionData: join(root, 'Angela') }
    const app = {
      isPackaged: packaged,
      getPath: (name: string) => paths[name],
      setPath: (name: string, value: string) => { paths[name] = value },
    }

    configureDataPaths(app)

    expect(JSON.parse(await readFile(join(paths.userData, 'character.json'), 'utf8'))).toEqual({ name: 'My character' })
    expect(paths.sessionData).toBe(paths.userData)
  })

  it('uses the explicitly configured profile for both application and Chromium data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'angela-profile-'))
    roots.push(root)
    const custom = join(root, 'custom')
    await mkdir(custom)
    await writeFile(join(custom, 'character.json'), '{"name":"Custom character"}')
    const paths: Record<string, string> = { appData: root, userData: join(root, 'Angela'), sessionData: join(root, 'Angela') }
    const app = {
      isPackaged: true,
      getPath: (name: string) => paths[name],
      setPath: (name: string, value: string) => { paths[name] = value },
    }

    configureDataPaths(app, ` ${custom} `)

    expect(JSON.parse(await readFile(join(paths.userData, 'character.json'), 'utf8'))).toEqual({ name: 'Custom character' })
    expect(paths.sessionData).toBe(paths.userData)
  })
})
