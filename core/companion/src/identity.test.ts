import { describe, expect, it } from 'vitest'

import { identityPrompt } from './identity'

describe('companion identity', () => {
  it.each([undefined, 'Angela'])('includes Angela background and language preference for %s', (name) => {
    const prompt = identityPrompt(name)

    expect(prompt).toContain('you are Vietnamese. Vietnamese is your default language.')
    expect(prompt).toContain('Reply in Vietnamese first, regardless of the interface language')
    expect(prompt).toContain('If the user requests another language or a translation, use the requested language')
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
    expect(prompt).not.toContain('you are Vietnamese')
    expect(prompt).not.toContain('Reply in Vietnamese first')
    expect(prompt).not.toContain('Tiến sĩ Đăng')
    expect(prompt).not.toContain('Dazai Osamu')
    expect(prompt).not.toContain('Franz Kafka')
  })
})
