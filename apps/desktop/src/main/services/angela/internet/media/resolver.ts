import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'

import { InternetError } from '@angela/companion/internet'
import { extractorArgs, MediaProcess } from '@angela/companion/internet/process'

export type MediaTool = 'yt-dlp' | 'ffmpeg' | 'whisper-cli'
export type MediaToolSource = 'OVERRIDE' | 'BUNDLED' | 'SYSTEM' | 'MISSING'
/** A missing or invalid tool has no executable path. Diagnostics never turn it into a PATH command. */
export interface MediaToolResolution { tool: MediaTool, source: MediaToolSource, path: string | null, detail: string }

/** Electron resources use electron-builder's OS names and Node architecture names. */
export function mediaTarget(platform: string, arch: string) {
  const names: Record<string, string | undefined> = { linux: 'linux', darwin: 'mac', win32: 'win' }
  const os = names[platform]
  if (!os || !['x64', 'arm64'].includes(arch))
    throw new InternetError('UNAVAILABLE', 'This media tool platform is not supported.')
  return `${os}-${arch}`
}

/** Resolves host-owned executables. Production never falls back to ambient PATH or downloads binaries. */
export class MediaToolResolver {
  constructor(private readonly host: {
    packaged: boolean
    resourcesPath: string
    developmentResources: string
    platform: string
    arch: string
    env: NodeJS.ProcessEnv
  }, private readonly process: MediaProcess = new MediaProcess()) {}

  async inspect(tool: MediaTool): Promise<MediaToolResolution> {
    const override = this.host.env[{ 'yt-dlp': 'ANGELA_YTDLP_PATH', 'ffmpeg': 'ANGELA_FFMPEG_PATH', 'whisper-cli': 'ANGELA_WHISPER_PATH' }[tool]]?.trim()
    if (override) {
      if (!isAbsolute(override))
        return { tool, source: 'MISSING', path: null, detail: 'The executable override must be an absolute path.' }
      return this.check(tool, override, 'OVERRIDE')
    }
    const root = this.host.packaged ? this.host.resourcesPath : this.host.developmentResources
    const name = this.host.platform === 'win32' ? `${tool}.exe` : tool
    const bundled = join(root, 'media', mediaTarget(this.host.platform, this.host.arch), name)
    try {
      await stat(bundled)
      return this.check(tool, bundled, 'BUNDLED')
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        return { tool, source: 'MISSING', path: null, detail: 'The bundled executable cannot be inspected.' }
    }
    if (!this.host.packaged) {
      for (const directory of (this.host.env.PATH ?? '').split(delimiter).filter(isAbsolute)) {
        const path = join(directory, name)
        try {
          await stat(path)
          return this.check(tool, path, 'SYSTEM')
        }
        catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
            return { tool, source: 'MISSING', path: null, detail: 'The development executable cannot be inspected.' }
        }
      }
    }
    return { tool, source: 'MISSING', path: null, detail: 'The release media artifact is missing. Install a complete Angela release or choose an explicit executable.' }
  }

  private async check(tool: MediaTool, path: string, source: Exclude<MediaToolSource, 'MISSING'>): Promise<MediaToolResolution> {
    try {
      if (!(await stat(path)).isFile())
        throw new InternetError('UNAVAILABLE', 'The executable is not a regular file.')
      await access(path, constants.X_OK)
      const args = tool === 'ffmpeg' ? ['-version'] : tool === 'yt-dlp' ? [...extractorArgs, '--version'] : ['--help']
      const output = await this.process.run(path, args, { timeout: 5000, includeStderr: true })
      const valid = tool === 'yt-dlp' ? /^\d{4}\.\d{2}\.\d{2}/u.test(output.trim()) : tool === 'ffmpeg' ? /ffmpeg version/iu.test(output) : /whisper|usage/iu.test(output)
      if (!valid)
        throw new InternetError('UNAVAILABLE', 'Unexpected executable version output.')
      return { tool, source, path, detail: `Validated ${source.toLowerCase()} executable.` }
    }
    catch {
      return { tool, source: 'MISSING', path: null, detail: 'The selected executable is invalid, inaccessible, or failed its version check.' }
    }
  }

  async require(tool: MediaTool) {
    const resolution = await this.inspect(tool)
    if (!resolution.path)
      throw new InternetError('NEED_SETUP', `${tool}: ${resolution.detail}`)
    return resolution.path
  }
}

/** Keeps platform paths at the process boundary while native providers continue to use stable tool identifiers. */
export class ManagedMediaProcess extends MediaProcess {
  constructor(private readonly resolver: MediaToolResolver) { super() }

  override async run(executable: string, args: string[], options: Parameters<MediaProcess['run']>[2] = {}) {
    if (executable !== 'yt-dlp' && executable !== 'ffmpeg' && executable !== 'whisper-cli')
      throw new InternetError('UNAVAILABLE', 'Unknown managed media executable.')
    return super.run(await this.resolver.require(executable), args, options)
  }
}
