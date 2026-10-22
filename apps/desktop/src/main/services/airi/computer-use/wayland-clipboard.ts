import process from 'node:process'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Uses wl-clipboard for background selection access when the Niri target owns keyboard focus. */
export class WaylandClipboard {
  private async command(binary: string, args: string[], input?: string): Promise<string> {
    try {
      const pending = execFileAsync(binary, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } })
      if (input !== undefined)
        pending.child.stdin?.end(input)
      return (await pending).stdout
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        throw new Error('Install wl-clipboard (wl-copy and wl-paste) for Niri desktop paste.', { cause: error })
      throw error
    }
  }

  async availableFormats(): Promise<string[]> {
    let output: string
    try {
      output = await this.command('wl-paste', ['--list-types'])
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 1 && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim() === 'Nothing is copied')
        return []
      throw error
    }
    // XWayland advertises these text aliases alongside MIME types. Preserve other formats so the caller can refuse rich data.
    return [...new Set(output.trim().split('\n').filter(Boolean).map(format => ['TEXT', 'STRING', 'UTF8_STRING'].includes(format) ? 'text/plain' : format))]
  }

  async readText(): Promise<string> {
    if ((await this.availableFormats()).length === 0)
      return ''
    return this.command('wl-paste', ['--no-newline', '--type', 'text'])
  }

  async writeText(text: string): Promise<void> {
    // Stdin keeps document text out of process arguments. wl-copy owns the selection until the next replacement.
    await this.command('wl-copy', ['--type', 'text/plain;charset=utf-8'], text)
  }

  async clear(): Promise<void> {
    await this.command('wl-copy', ['--clear'])
  }
}
