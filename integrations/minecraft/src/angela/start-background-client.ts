import { isAuthenticationServerErrorMessage } from '@angela/server-shared'
import { errorMessageFrom } from '@moeru/std'

interface AngelaClientLike {
  connect: () => Promise<void>
}

interface LoggerLike {
  log: (message: string) => void
  warn: (message: string) => void
  withFields: (fields: Record<string, unknown>) => LoggerLike
}

/** Starts a background connection and reports each failure category once until the connection succeeds. */
export function startAngelaClientConnection(client: AngelaClientLike, deps: {
  logger: LoggerLike
  url: string
}) {
  let unavailableReported = false
  let authenticationReported = false

  const reportAuthenticationFailure = (error: unknown) => {
    const message = errorMessageFrom(error) ?? 'Unknown error'
    if (!isAuthenticationServerErrorMessage(message))
      return false

    if (!authenticationReported) {
      authenticationReported = true
      deps.logger.withFields({ url: deps.url, error: message }).warn(
        'Angela authentication failed. Copy the token from Angela Settings -> Connection. Set AIRI_WS_TOKEN in integrations/minecraft/.env.local to that token. Then restart the bot.',
      )
    }
    return true
  }

  const reportUnavailable = (error: unknown) => {
    if (reportAuthenticationFailure(error))
      return

    if (unavailableReported)
      return

    unavailableReported = true
    deps.logger.withFields({
      url: deps.url,
      error: errorMessageFrom(error) ?? 'Unknown error',
    }).warn('Angela server is unavailable. Continuing startup without Angela and retrying in background')
  }

  const reportDisconnected = () => {
    deps.logger.withFields({
      url: deps.url,
    }).warn('Angela server connection closed. Retrying in background')
  }

  void client.connect()
    .then(() => {
      deps.logger.withFields({
        url: deps.url,
      }).log(
        unavailableReported
          ? 'Connected to Angela server after background retry'
          : 'Connected to Angela server',
      )
      unavailableReported = false
      authenticationReported = false
    })
    .catch((error) => {
      if (reportAuthenticationFailure(error))
        return

      deps.logger.withFields({
        url: deps.url,
        error: errorMessageFrom(error) ?? 'Unknown error',
      }).warn('Angela client stopped retrying')
    })

  return {
    reportUnavailable,
    reportDisconnected,
  }
}
