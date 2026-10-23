import type { BrowserMediaContextProvider } from '@angela/companion/internet'

import { InternetError } from '@angela/companion/internet'

/** Extension consent takes precedence. Only unavailable observations fall through to the existing MCP session. No browser profiles are searched. */
export class ActiveBrowserMediaProvider implements BrowserMediaContextProvider {
  constructor(private readonly extension: BrowserMediaContextProvider, private readonly playwright: BrowserMediaContextProvider) {}

  async getActiveMediaContext() {
    try {
      return await this.extension.getActiveMediaContext()
    }
    catch (error) {
      if (!(error instanceof InternetError) || !['UNAVAILABLE', 'INVALID_URL'].includes(error.code))
        throw error
    }
    try {
      return await this.playwright.getActiveMediaContext()
    }
    catch (error) {
      if (!(error instanceof InternetError))
        throw new InternetError('UNAVAILABLE', 'Connect the Study Along extension or Angela Browser to your lesson tab.')
      throw new InternetError(error.code, 'No active lesson is available. Share your current YouTube tab through the extension or connect Angela Browser. You can also supply a video URL and playback position.')
    }
  }
}
