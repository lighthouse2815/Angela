import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { kill as killProcess } from 'node:process'

import { waitFor } from './remote-debug'

function isProcessGroupAlive(pid: number): boolean {
  try {
    killProcess(-pid, 0)
    return true
  }
  catch {
    return false
  }
}

/**
 * Stops a detached smoke process and its descendants, including children that outlive the wrapper.
 * Sends SIGTERM, waits up to five seconds, then sends SIGKILL to the surviving group.
 * On platforms without process groups, signals the direct process instead.
 */
export async function stopProcessGroup(child: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  const pid = child?.pid
  if (!child || pid === undefined)
    return

  const isAlive = () => isProcessGroupAlive(pid) || (child.exitCode === null && child.signalCode === null)
  if (!isAlive())
    return

  const signal = (value: NodeJS.Signals) => {
    try {
      killProcess(-pid, value)
    }
    catch {
      child.kill(value)
    }
  }

  signal('SIGTERM')
  await waitFor('smoke process group exit', () => isAlive() ? undefined : true, 5_000, 100)
    .catch(() => signal('SIGKILL'))
}
