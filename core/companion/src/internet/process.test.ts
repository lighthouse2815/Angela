import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { MediaProcess } from './process'

describe('media process boundary', () => {
  it('passes arguments literally without shell interpolation', async () => {
    const marker = '$(echo unexpected); ignored'
    const result = await new MediaProcess().run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', marker])
    expect(result).toBe(marker)
  })

  it('keeps process stderr and secrets out of application errors', async () => {
    await expect(new MediaProcess().run(process.execPath, ['-e', 'process.stderr.write("signed-url-secret"); process.exit(1)'])).rejects.toThrow('PROVIDER_FAILED')
    await expect(new MediaProcess().run(process.execPath, ['-e', 'process.stderr.write("signed-url-secret"); process.exit(1)'])).rejects.not.toThrow('signed-url-secret')
  })

  it('stops a stalled subprocess within its time budget', async () => {
    await expect(new MediaProcess().run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 30 })).rejects.toThrow('PROVIDER_FAILED')
  })

  it('rejects an already-cancelled operation', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(new MediaProcess().run(process.execPath, ['-e', 'process.stdout.write("unexpected")'], { signal: abort.signal })).rejects.toThrow('CANCELLED')
  })
})
