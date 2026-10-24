import process from 'node:process'

/**
 * Stages reviewed Linux release media. Runtime startup never invokes this command.
 *
 * Call stack:
 *
 * pnpm prepare:media [linux-x64]
 *   -> downloadMediaAsset (pinned bytes)
 *   -> Docker (isolated FFmpeg build)
 *   -> checkMediaArtifacts
 *   -> replace generated release directory
 */
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import lock from './media/linux-x64.lock.json'

import { checkMediaArtifacts } from './media-artifacts'
import { downloadMediaAsset, matchesMediaRecipe, mediaDigest } from './media-release'

const execute = promisify(execFile)
const target = process.argv[2] ?? `${process.platform}-${process.arch}`
if (target !== lock.target || process.platform !== 'linux' || process.arch !== 'x64')
  throw new Error('Automatic media preparation supports a Linux x64 host and target. Other targets require separately reviewed artifacts.')

const root = resolve(import.meta.dirname, '..')
const recipes = join(import.meta.dirname, 'media')
const parent = join(root, 'resources', 'media')
const destination = join(parent, target)
const cache = resolve(root, '../../.temp/release-media-cache')
const recipe = createHash('sha256')
for (const file of ['linux-x64.lock.json', 'Dockerfile', 'build-ffmpeg.sh'])
  recipe.update(await readFile(join(recipes, file)))
const digest = recipe.digest('hex')

if (await matchesMediaRecipe(destination, digest)) {
  await checkMediaArtifacts(destination, false)
  console.info(`Verified cached release media: ${target}`)
}
else {
  await mkdir(parent, { recursive: true })
  const stage = await mkdtemp(join(parent, `.stage-${target}-`))
  const backup = join(parent, `.previous-${target}-${randomUUID()}`)
  let previous = false
  try {
    await Promise.all(['licenses', 'sources'].map(directory => mkdir(join(stage, directory))))
    for (const [asset, path] of [
      [lock.ytDlp, 'yt-dlp'],
      [lock.ytDlpLicense, 'licenses/yt-dlp.txt'],
      [lock.ytDlpNotices, 'licenses/yt-dlp-third-party.txt'],
      [lock.ffmpeg, 'sources/ffmpeg.tar.xz'],
      [lock.ffmpegSignature, 'sources/ffmpeg.tar.xz.asc'],
      [lock.ffmpegKey, 'sources/ffmpeg-key.asc'],
    ] as const)
      await copyFile(await downloadMediaAsset(asset, cache), join(stage, path))
    await chmod(join(stage, 'yt-dlp'), 0o755)
    await copyFile(join(recipes, 'build-ffmpeg.sh'), join(stage, 'sources', 'build-ffmpeg.sh'))
    await copyFile(join(recipes, 'Dockerfile'), join(stage, 'sources', 'Dockerfile'))
    await copyFile(join(recipes, 'linux-x64.lock.json'), join(stage, 'sources', 'media.lock.json'))
    const image = `angela-ffmpeg:${digest.slice(0, 16)}`
    console.info('Building FFmpeg from verified release source. Build output stays inside the staging directory.')
    const build = await execute('docker', ['build', '--platform', 'linux/amd64', '-t', image, '-f', join(recipes, 'Dockerfile'), recipes], { timeout: 900000, maxBuffer: 8 * 1024 * 1024 })
    await writeFile(join(stage, 'sources', 'container-build.log'), `${build.stdout}\n${build.stderr}`)
    const result = await execute('docker', ['run', '--rm', '--network=none', '--platform', 'linux/amd64', '--user', `${process.getuid!()}:${process.getgid!()}`, '--env', 'SOURCE_DATE_EPOCH=0', '--mount', `type=bind,source=${stage},target=/work`, image, 'sh', '/work/sources/build-ffmpeg.sh'], { timeout: 900000, maxBuffer: 8 * 1024 * 1024 })
    await writeFile(join(stage, 'sources', 'ffmpeg-build.log'), `${result.stdout}\n${result.stderr}`)
    const ytDlp = await execute(join(stage, 'yt-dlp'), ['--ignore-config', '--version'])
    const ffmpeg = await execute(join(stage, 'ffmpeg'), ['-version'])
    if (ytDlp.stdout.trim() !== lock.ytDlp.version || !ffmpeg.stdout.startsWith(`ffmpeg version ${lock.ffmpeg.version} `))
      throw new Error('Staged executable versions do not match the reviewed lock')
    const supportingFiles: { path: string, sha256: string }[] = []
    for (const directory of ['licenses', 'sources']) {
      for (const file of await readdir(join(stage, directory))) {
        const path = `${directory}/${file}`
        supportingFiles.push({ path, sha256: await mediaDigest(join(stage, path)) })
      }
    }
    await writeFile(join(stage, 'manifest.json'), `${JSON.stringify({
      'yt-dlp': { version: lock.ytDlp.version, sha256: await mediaDigest(join(stage, 'yt-dlp')), license: 'licenses/yt-dlp.txt' },
      'ffmpeg': { version: lock.ffmpeg.version, sha256: await mediaDigest(join(stage, 'ffmpeg')), license: 'licenses/ffmpeg.txt' },
      supportingFiles,
    }, null, 2)}\n`)
    await writeFile(join(stage, 'recipe.json'), `${JSON.stringify({ sha256: digest })}\n`)
    await checkMediaArtifacts(stage, false)
    try {
      await rename(destination, backup)
      previous = true
    }
    catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT')
        throw cause
    }
    try {
      await rename(stage, destination)
    }
    catch (cause) {
      if (previous)
        await rename(backup, destination)
      throw cause
    }
    if (previous)
      await rm(backup, { recursive: true })
    console.info(`Release media ready: ${destination}`)
  }
  finally {
    await rm(stage, { recursive: true, force: true })
  }
}
