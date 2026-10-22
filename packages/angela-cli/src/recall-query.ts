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
