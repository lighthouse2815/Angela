import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { InternetError } from './contracts'

const execute = promisify(execFile)

/** Runs fixed media commands without a shell. Raw process errors can contain signed URLs and stay private. */
export class MediaProcess {
  async run(executable: string, args: string[], options: { cwd?: string, timeout?: number, signal?: AbortSignal } = {}) {
    try {
      const { stdout } = await execute(executable, args, {
        ...options,
        timeout: options.timeout ?? 90000,
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
      })
      return stdout
    }
    catch (error) {
      if (options.signal?.aborted)
        throw new InternetError('CANCELLED', 'Media operation was cancelled.')
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        throw new InternetError('NEED_SETUP', 'Install the configured media executable and check its path.')
      throw new InternetError('PROVIDER_FAILED', 'Media extraction failed or exceeded its time or output budget.')
    }
  }
}

/** Ignores ambient yt-dlp configuration so extraction never imports cookies or executes configured hooks. */
export const extractorArgs = ['--ignore-config', '--no-warnings', '--no-playlist', '--no-update', '--js-runtimes', 'node', '--socket-timeout', '15', '--retries', '1', '--extractor-retries', '1']
