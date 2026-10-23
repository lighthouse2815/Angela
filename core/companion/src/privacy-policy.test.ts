import { expect, it } from 'vitest'

import { durableWriteRejection, requestPrivacy, sensitiveContent } from './privacy-policy'

it.each([
  'Đừng lưu chuyện này: tôi đang học tiếng Ý.',
  'KHÔNG LƯU: sở thích này.',
  'Đừng ghi nhớ chuyện này.',
  'Không ghi nhớ câu này.',
  'Đừng nhớ chuyện này: một dữ kiện.',
  'Chỉ dùng trong phiên này: một dữ kiện.',
  'Don\'t save this: a fact.',
  'Don\'t store this: a fact.',
  'Don’t remember this: a fact.',
  'Keep this only for this session: a fact.',
])('detects explicit no-store intent: %s', (text) => {
  expect(requestPrivacy(text)).toMatchObject({ durableMemoryAllowed: false, reason: 'user-request' })
})

it.each([
  'Tôi không nhớ mật khẩu.',
  'Tôi không nhớ mật khẩu của mình.',
  'I don\'t remember my password.',
  'Project backend dùng .NET.',
  'The secret project codename is sunflower.',
  'Please explain how an API key works.',
])('does not mistake ordinary text for a privacy directive or credential: %s', (text) => {
  expect(requestPrivacy(text).durableMemoryAllowed).toBe(true)
})

it.each([
  'Mật khẩu test của tôi là fixture-only-password.',
  'My password is fixture-only-password.',
  'My API key is sk-fixture-123...',
  'Access token: fixture-token',
  'Auth cookie = fixture-cookie',
  'Private key: fixture-key',
  'Recovery code is fixture-recovery',
  'OTP: 123456',
  'Verification code 123456',
  'Mã xác minh của tôi là 123456',
  'credential-like secret is fixture-secret',
  '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----',
  'Bearer fixture-token',
])('protects bounded credential declarations and formats: %s', (text) => {
  expect(sensitiveContent(text)).toBe(true)
  expect(requestPrivacy(text)).toMatchObject({ durableMemoryAllowed: false, reason: 'sensitive-content' })
})

it('retains provenance when later tool payloads strip or paraphrase the original declaration', () => {
  const first = requestPrivacy('Đừng lưu: mật khẩu test là fixture-only-password')
  const next = requestPrivacy('Remember the previous information.', true, first)
  for (const domain of ['personal', 'project', 'task', 'workflow'] as const) {
    expect(durableWriteRejection(next, domain, { text: 'User credential is fixture-only-password' })).toEqual({ status: 'rejected', reason: 'sensitive-content' })
    expect(durableWriteRejection(next, domain, { text: 'A paraphrase without the original labels' })).toMatchObject({ status: 'rejected' })
  }
})

it('keeps project and requested task writes independent when personal memory is disabled', () => {
  const goal = requestPrivacy('Nhớ giúp tôi là tôi muốn học .NET.', false)
  expect(durableWriteRejection(goal, 'project', { goal: 'Study .NET' })).toMatchObject({ reason: 'memory-disabled' })
  expect(durableWriteRejection(goal, 'task', { title: 'Study .NET' })).toMatchObject({ reason: 'memory-disabled' })
  expect(durableWriteRejection(requestPrivacy('Project backend dùng .NET.', false), 'project', { goal: 'Use .NET' })).toBeUndefined()
  expect(durableWriteRejection(requestPrivacy('Nhắc tôi học .NET ngày mai.', false), 'task', { title: 'Study .NET' })).toBeUndefined()
  expect(durableWriteRejection(requestPrivacy('Project backend dùng .NET.', false), 'personal', { text: '.NET' })).toMatchObject({ reason: 'memory-disabled' })
})

it('does not authorize a disabled personal goal through a later project or task reference', () => {
  const first = requestPrivacy('Nhớ giúp tôi là tôi muốn học .NET.', false)
  const next = requestPrivacy('Save that in project memory and create a task.', false, first)
  expect(durableWriteRejection(next, 'project', { goal: 'Study .NET' })).toMatchObject({ status: 'rejected', reason: 'memory-disabled' })
  expect(durableWriteRejection(next, 'task', { title: 'Study .NET' })).toMatchObject({ status: 'rejected', reason: 'memory-disabled' })
})
