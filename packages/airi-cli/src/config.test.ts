import { describe, expect, it } from 'vitest'

import { readConfig } from './config'

describe('cLI configuration', () => {
  it('shows help without credentials or a model', () => {
    expect(readConfig(['--help'], {})).toMatchObject({ help: true })
  })

  it('takes flags before environment configuration and keeps credentials out of arguments', () => {
    expect(readConfig(['--model', 'selected', '--locale', 'en'], {
      ANGELA_MODEL: 'other',
      ANGELA_BASE_URL: 'http://localhost:1234/v1/',
      ANGELA_API_KEY: 'test-only',
    })).toMatchObject({ model: 'selected', baseUrl: 'http://localhost:1234/v1/', apiKey: 'test-only' })
    expect(() => readConfig(['--api-key', 'test-only'], {})).toThrow()
  })

  it('rejects missing models and invalid endpoints or protocols before network access', () => {
    expect(() => readConfig([], {})).toThrow('ANGELA_MODEL')
    expect(() => readConfig(['--model', 'm', '--base-url', 'file:///tmp/provider'], {})).toThrow('HTTP')
    expect(() => readConfig(['--model', 'm', '--api', 'invalid'], {})).toThrow('responses')
  })
})
