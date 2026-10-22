import { expect, it } from 'vitest'

import { isConversationRecap, normalizeSearch, searchTerms, supportsContext } from './recall-query'

it('folds Vietnamese accents and composed spelling without losing original source evidence', () => {
  expect(normalizeSearch('Đường đi ĐẮK LẮK')).toBe('duong di dak lak')
  expect(normalizeSearch('Đường đi'.normalize('NFD'))).toBe('duong di')
})

it('does not confuse accented Vietnamese content words with English articles or Vietnamese pronouns', () => {
  expect(supportsContext('Bản nháp bị lỗi ở đâu?', 'Bản nháp cần sửa dấu câu.')).toBe(true)
  expect(supportsContext('Sở thích ăn uống của tôi?', 'Tôi thích ăn chay.')).toBe(true)
  expect(supportsContext('Bạn của mình ở đâu?', 'Bạn thích trà.')).toBe(false)
})

it('expands a personal name relation without treating unrelated uses of names as equivalent', () => {
  expect(searchTerms('Biệt danh của tôi là gì?')).toContain('goi')
  expect(supportsContext('Nickname của mình là gì?', 'Bạn muốn được gọi là Khoai.')).toBe(true)
  expect(supportsContext('ban nho biet danh cua toi khong?', 'Tôi muốn được gọi là Khoai.')).toBe(true)
  expect(supportsContext('Biệt danh của Lan là gì?', 'Tôi muốn được gọi là Khoai.')).toBe(false)
  expect(supportsContext('Tôi muốn bạn gọi bằng tên gì?', 'Tôi thích được gọi là Khoai.')).toBe(true)
  expect(supportsContext('Đổi tên file thế nào?', 'Tôi muốn được gọi là Khoai.')).toBe(false)
})

it('uses procedure identity plus topical evidence without accepting every procedural page', () => {
  expect(supportsContext('Quy trình học Rust tôi dùng là gì?', 'Đọc tài liệu Rust rồi chạy ví dụ.', 'procedural')).toBe(true)
  expect(supportsContext('Quy trình học Rust tôi dùng là gì?', 'Đọc tài liệu Rust rồi chạy ví dụ.', 'semantic')).toBe(false)
  expect(supportsContext('Quy trình học Rust tôi dùng là gì?', 'Chuẩn bị nguyên liệu rồi nấu bữa tối.', 'procedural')).toBe(false)
})

it.each([
  'Lần trước mình nói gì?',
  'Bữa trước mình kể chuyện gì với bạn?',
  'hom truoc minh hoi gi?',
  'Cuộc nói chuyện trước có nội dung gì?',
  'truoc do minh noi gi?',
])('recognizes general conversation intent in %s', (query) => {
  expect(isConversationRecap(query)).toBe(true)
})

it.each([
  'Lần trước mình nói gì về ngân sách?',
  'Tại sao lần trước chương trình bị lỗi?',
  'Bạn nhớ lần chúng ta đi bơi không?',
  'Tôi thích kể chuyện lịch sử.',
])('does not infer a general recap from %s', (query) => {
  expect(isConversationRecap(query)).toBe(false)
})
