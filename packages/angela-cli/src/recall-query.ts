const ignored = new Set('a an the is are was were i you me my we to of in on and or for this that what how please toi ban minh la thi ma va co cho cua cac cai voi duoc lam gi nhu hay khong mot nhung tôi bạn mình là thì mà và có của các cái với được làm gì như không một những muốn muon'.split(' '))

/**
 * Folds Vietnamese spelling for search without changing stored source text.
 * @example
 * normalizeSearch('Đường đi')
 * // => 'duong di'
 */
export function normalizeSearch(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase()
}

/** Personal names share a relation across common labels. Subject qualifiers still need their own evidence. */
function names(text: string) {
  return /\b(?:biet danh|ten goi|goi (?:bang )?ten|duoc goi|goi la|cach xung ho|nickname|preferred name|call me)\b/u.test(normalizeSearch(text))
}

/** Query expansion stays bounded and works with existing FTS projections, without a database rebuild. */
export function searchTerms(query: string) {
  const text = names(query) ? `${query} goi ten nickname` : query
  return [...new Set(normalizeSearch(text).match(/[\p{L}\p{N}_-]+/gu) ?? [])].filter(term => term.length > 1 && !ignored.has(term)).slice(-32)
}

/**
 * Rank alone is not relevance. Two content tokens provide corroboration beyond one ambiguous word.
 * A one-token lookup requires that exact token. A typed procedure plus a topical token also supplies two independent signals.
 */
export function supportsContext(query: string, text: string, kind?: string) {
  // Remove grammar before accent folding. English "an" and Vietnamese "bạn" must not erase "ăn" or "bản".
  const original = query.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []
  let content = [...new Set(original.filter(term => !ignored.has(term)).map(normalizeSearch))]
  const topic = normalizeSearch(query).replace(/\b(?:giai thich|vi sao|nhu the nao|the nao|la gi|hien tai|o dau|nao|khi|vao)\b/gu, ' ')
  const topicWords = new Set(topic.match(/[\p{L}\p{N}_-]+/gu) ?? [])
  content = content.filter(term => topicWords.has(term))
  const words = new Set(normalizeSearch(text).match(/[\p{L}\p{N}_-]+/gu) ?? [])
  if (names(query)) {
    const nameWords = new Set('biet danh ten goi duoc bang la cach xung ho nickname preferred name call me nho remember recall'.split(' '))
    content = content.filter(term => !nameWords.has(term))
    content.push('personal_name')
    if (names(text))
      words.add('personal_name')
  }
  const matches = content.filter(term => words.has(term)).length
  if (kind === 'procedural' && /\b(?:quy trinh|workflow|procedure)\b/u.test(normalizeSearch(query))) {
    const procedureWords = new Set('quy trinh workflow procedure dung use using'.split(' '))
    if (content.some(term => !procedureWords.has(term) && words.has(term)))
      return true
  }
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
