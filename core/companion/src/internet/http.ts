import { InternetError } from './contracts'

/** Reads provider data within a hard byte budget. Callers own destination validation and request timeouts. */
export async function readProviderText(response: Response, limit = 8 * 1024 * 1024) {
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new InternetError('PROVIDER_FAILED', `Provider request failed (${response.status}).`)
  }
  const reader = response.body.getReader()
  let size = 0
  let text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      size += chunk.value.byteLength
      if (size > limit)
        throw new InternetError('LIMIT_EXCEEDED', 'Provider response exceeded its byte budget.')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return text + decoder.decode()
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
