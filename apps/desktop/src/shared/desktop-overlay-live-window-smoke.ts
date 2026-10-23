function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function selectDesktopOverlaySmokeCandidateId(runState: Record<string, unknown>): string {
  const snapshot = runState.lastGroundingSnapshot
  if (!isRecord(snapshot))
    throw new Error('desktop_get_state missing lastGroundingSnapshot after desktop_observe')

  const candidates = Array.isArray(snapshot.targetCandidates)
    ? snapshot.targetCandidates.filter(isRecord)
    : []

  const selected = candidates.find((candidate) => {
    return candidate.source === 'chrome_dom'
      && String(candidate.label || '').includes('Angela Desktop Overlay Smoke Button')
  })

  const id = typeof selected?.id === 'string' ? selected.id : ''
  if (!id)
    throw new Error('desktop_observe did not return the Angela Desktop Overlay Smoke Button chrome_dom candidate')

  return id
}

/** A live smoke requires a native executor. A dry run cannot prove pointer or window behavior. */
export function resolveDesktopOverlaySmokeExecutor(env: Record<string, string | undefined>, platform: string) {
  const executor = env.COMPUTER_USE_SMOKE_EXECUTOR || env.COMPUTER_USE_EXECUTOR || 'macos-local'
  if (executor === 'macos-local') {
    if (platform !== 'darwin')
      throw new Error('SMOKE_HOST_UNSUPPORTED: macos-local requires macOS. For a remote Linux X11 host, configure COMPUTER_USE_SMOKE_EXECUTOR=linux-x11 and its SSH settings.')
    return executor
  }
  if (executor === 'linux-x11') {
    if (!env.COMPUTER_USE_REMOTE_SSH_HOST?.trim() || !env.COMPUTER_USE_REMOTE_SSH_USER?.trim())
      throw new Error('SMOKE_HOST_UNCONFIGURED: linux-x11 requires COMPUTER_USE_REMOTE_SSH_HOST and COMPUTER_USE_REMOTE_SSH_USER.')
    return executor
  }
  throw new Error('SMOKE_EXECUTOR_INVALID: use macos-local or linux-x11 for a live desktop smoke.')
}
