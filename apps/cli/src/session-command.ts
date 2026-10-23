import process from 'node:process'

import { Sessions } from '@angela/companion/sessions'
import { readConfig } from '@angela/host-sdk/config'
import { Voice } from '@angela/voice-client/voice'

import { Terminal } from './terminal'

/** Runs local history administration without loading a provider or changing the current chat session. */
export async function runSessionCommand(args: string[], env: NodeJS.ProcessEnv) {
  const rest = [...args]
  const action = rest[0]?.startsWith('-') ? 'list' : rest.shift() ?? 'list'
  const id = action === 'delete' && rest[0] && !rest[0].startsWith('-') ? rest.shift() : undefined
  const config = await readConfig(['--list-sessions', ...rest], env)
  if (config.help) {
    process.stdout.write(`${config.messages.sessionsUsage}\n`)
    return
  }
  if (!config.list)
    throw new Error(config.messages.sessionsUsage)
  const sessions = new Sessions(config.dataDir, config.messages)
  switch (action) {
    case 'list':
      process.stdout.write(`${JSON.stringify(await sessions.list(), null, 2)}\n`)
      return
    case 'usage':
      process.stdout.write(`${JSON.stringify(await sessions.usage(), null, 2)}\n`)
      return
    case 'cleanup-audio':
      process.stdout.write(`${JSON.stringify(await Voice.cleanupTemporaryAudio())}\n`)
      return
    case 'delete': {
      if (!id)
        throw new Error(config.messages.sessionsUsage)
      const record = await sessions.read(id)
      process.stdout.write(`${JSON.stringify({ id: record.id, workspace: record.workspace, updatedAt: record.updatedAt })}\n`)
      if (!process.stdin.isTTY)
        throw new Error(config.messages.sessionDeleteInteractive)
      const terminal = new Terminal(() => terminal.close())
      try {
        if ((await terminal.ask(`${config.messages.sessionDeleteConfirm} ${id}\n> `))?.trim() !== id) {
          process.stdout.write(`${config.messages.sessionDeleteCancelled}\n`)
          return
        }
        await sessions.remove(id)
        process.stdout.write(`${config.messages.sessionDeleted}: ${id}\n`)
      }
      finally {
        terminal.close()
      }
      return
    }
    default:
      throw new Error(config.messages.sessionsUsage)
  }
}
