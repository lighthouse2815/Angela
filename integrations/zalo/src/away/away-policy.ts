import type { AwayModeState, ExternalMessage } from './away-types'

/** Authorization uses stable sender IDs. Replay rejection also applies after process restarts. */
export function evaluateAway(state: AwayModeState, message: ExternalMessage, now: number) {
  if (message.isSelf)
    return 'self_message'
  const timestamp = Date.parse(message.receivedAt)
  if (!Number.isFinite(timestamp) || timestamp < now - 5 * 60_000 || timestamp > now + 30_000)
    return 'replay_message'
  if (!state.enabled)
    return 'away_disabled'
  if (!state.allowedUsers.includes(message.senderId))
    return 'whitelist_denied'
  if (!message.text.trim() || message.text.length > 8000)
    return 'unsupported_message'
  return 'allowed'
}
