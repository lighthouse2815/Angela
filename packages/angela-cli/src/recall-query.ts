const ignored = new Set('a an the is are was were i you me my we to of in on and or for this that what how please toi ban minh la thi ma va co cho cua cac cai voi duoc lam gi nhu hay khong mot nhung'.split(' '))

/**
 * Folds Vietnamese spelling for search without changing stored source text.
 * @example
 * normalizeSearch('Đường đi')
 * // => 'duong di'
 */
export function normalizeSearch(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase()
}

/** Query length and unique terms retain the existing FTS candidate bound. */
export function searchTerms(query: string) {
  return [...new Set(normalizeSearch(query).match(/[\p{L}\p{N}_-]+/gu) ?? [])].filter(term => term.length > 1 && !ignored.has(term)).slice(-32)
}

/**
 * Rank alone is not relevance. Multiword queries need two distinct matching content terms.
 * Single-term diagnostic lookups need that exact token. Accepted vector candidates supply independent semantic evidence upstream.
 */
export function supportsContext(query: string, text: string) {
  const content = searchTerms(normalizeSearch(query).replace(/\b(?:giai thich|vi sao|the nao|nhu the nao|la gi|nao|khi|vao|hien tai)\b/gu, ' '))
  const words = new Set(normalizeSearch(text).match(/[\p{L}\p{N}_-]+/gu) ?? [])
  const matches = content.filter(term => words.has(term)).length
  return content.length > 0 && matches >= Math.min(content.length, 2)
}

/**
 * A recap needs a past-time signal, conversation language and no remaining topic.
 * Topical questions stay lexical/semantic searches, so a passing reference to the past cannot select an unrelated latest session.
 */
export function isConversationRecap(query: string) {
  const text = normalizeSearch(query)
  const past = /\b(?:(?:lan|bua|hom|buoi) truoc|(?:cuoc )?(?:noi chuyen|tro chuyen) truoc|truoc do|last (?:time|conversation|session)|previous (?:conversation|session)|earlier)\b/gu
  const conversation = /\b(?:noi chuyen|tro chuyen|trao doi|thao luan|noi|ke|hoi|discuss(?:ed)?|talk(?:ed)?|say|said|conversation|session)\b/gu
  if (!past.test(text) || !conversation.test(text))
    return false
  past.lastIndex = 0
  conversation.lastIndex = 0
  const topic = text.replace(past, ' ').replace(/\b(?:noi dung|chu de)\b/gu, ' ').replace(conversation, ' ').replace(/\b(?:cuoc|chuyen|noi dung|chu de|hai dua|chung ta|voi nhau|our|did|do|about|in|nhac|lai|nho|nhung|dieu|nhung gi|da|o|va|co|gi|khong|nhe|nhi)\b/gu, ' ')
  return searchTerms(topic).length === 0
}
