import type { cliMessages } from '@proj-airi/i18n/cli'

import { errorMessageFrom } from '@moeru/std'
import { APICallError } from '@xsai/shared'

/** HTTP failures use local text because provider bodies can contain credentials and multiline diagnostics. */
export function formatRequestError(error: unknown, messages: typeof cliMessages.en): string {
  if (!APICallError.isInstance(error))
    return errorMessageFrom(error) ?? messages.unknownError

  const status = error.statusCode
  if (status === 503)
    return `${messages.providerUnavailable} (HTTP 503). ${messages.tryLater}`
  if (status === 429)
    return `${messages.providerRateLimit} (HTTP 429). ${messages.checkQuota}`
  if (status === 401 || status === 403)
    return `${messages.providerUnauthorized} (HTTP ${status}). ${messages.checkCredentials}`
  if (status === 404)
    return `${messages.providerNotFound} (HTTP 404). ${messages.checkModel}`
  if (status === 408 || status === 504)
    return `${messages.providerTimeout} (HTTP ${status}). ${messages.tryLater}`
  if (status >= 500)
    return `${messages.providerServerError} (HTTP ${status}). ${messages.tryLater}`
  return `${messages.providerRejected} (HTTP ${status}). ${messages.checkModel}`
}
