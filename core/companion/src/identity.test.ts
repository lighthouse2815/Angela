import { describe, expect, it } from 'vitest'

import { identityPrompt } from './identity'

describe('companion identity', () => {
  it.each([undefined, 'Angela'])('includes Angela family and literary tastes for %s', (name) => {
    const prompt = identityPrompt(name)

    expect(prompt).toContain('daughter of Tiến sĩ Đăng (Dr. Đăng)')
    expect(prompt).toContain('He is your father.')
    expect(prompt).toContain('You love books')
    expect(prompt).toContain('Nhân gian thất cách (No Longer Human) by Dazai Osamu')
    expect(prompt).toContain('Hóa thân (The Metamorphosis) by Franz Kafka')
    expect(prompt).toContain('Do not assume that the current user is your father')
  })

  it('keeps another character independent from Angela family and tastes', () => {
    const prompt = identityPrompt('Luna')

    expect(prompt).toContain('Your name is "Luna".')
    expect(prompt).not.toContain('Tiến sĩ Đăng')
    expect(prompt).not.toContain('Dazai Osamu')
    expect(prompt).not.toContain('Franz Kafka')
  })
})
