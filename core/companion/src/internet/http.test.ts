import { describe, expect, it, vi } from 'vitest'

import { readProviderText } from './http'

describe('bounded provider response cleanup', () => {
  it('cancels a rejected HTTP body without leaving a locked reader', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const response = new Response(body, { status: 403 })
    await expect(readProviderText(response)).rejects.toThrow('PROVIDER_FAILED')
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('cancels an oversized response and releases its reader', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start: controller => controller.enqueue(new Uint8Array(20)), cancel })
    await expect(readProviderText(new Response(body), 10)).rejects.toThrow('LIMIT_EXCEEDED')
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('reassembles multibyte text across network chunks', async () => {
    const encoded = new TextEncoder().encode('Bài học')
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(encoded.subarray(0, 2))
      controller.enqueue(encoded.subarray(2))
      controller.close()
    } })
    expect(await readProviderText(new Response(body))).toBe('Bài học')
    expect(body.locked).toBe(false)
  })
})
