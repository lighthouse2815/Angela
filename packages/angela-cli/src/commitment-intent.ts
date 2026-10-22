/** Classification precedes both local extraction and model tools. Uncertain requests cannot create durable tasks. */
export type CommitmentIntent = 'create' | 'follow_up' | 'meta' | 'hypothetical' | 'quoted' | 'negative' | 'uncertain' | 'none'

/** Returns authorization from the user's request, independently of model-selected tool arguments. */
export function classifyCommitmentIntent(text: string): CommitmentIntent {
  const value = text.normalize('NFKC').trim().toLowerCase()
  if (/(?:đừng|không cần|không được|chớ)\s|\b(?:do not|don't|never)\b/u.test(value))
    return 'negative'
  if (/(?:^|\s)nếu\s|\b(?:if|suppose|imagine)\b/u.test(value))
    return 'hypothetical'
  if (/tại sao|vì sao|parser|hệ thống|ví dụ|(?:^|\s)câu\s|(?:đang|muốn)\s+test|người dùng|\b(?:example|testing|test|user says|user said)\b/u.test(value))
    return 'meta'
  if (/["“”`\n]|(?:^|\s)'[^']+'(?:$|\s)/u.test(value))
    return 'quoted'
  if (/có lẽ|(?:^|\s)chắc\s|\b(?:maybe|perhaps|probably)\b|\?/u.test(value))
    return 'uncertain'
  const actions = [...value.matchAll(/(?:nhớ\s+)?nhắc(?:\s+(?:tao|tôi|mình|tớ|em|anh))?|gọi\s+(?:tôi|tao|mình)|(?:nhớ\s+)?hỏi(?:\s+(?:tao|tôi|mình))?(?:\s+lại)?|check\s+xem|(?:tạo|thêm|lưu)\s+(?:việc|lịch|tác vụ|task|todo)|\b(?:remind|schedule|add|create|save)\b/gu)]
  if (!actions.length)
    return 'none'
  if (actions.length !== 1 || /(?:^|\s)hoặc\s|\bor\b/u.test(value))
    return 'uncertain'
  const action = actions[0]!
  if (/^nhắc\s+lại/u.test(value.slice(action.index)))
    return 'none'
  // Only temporal expressions and direct-request prefixes can precede the action.
  const prefix = value.slice(0, action.index)
    .split(/[.!;]/u)
    .at(-1)!
    .replace(/(?:ngày\s+)?mai|hôm nay|tối nay|thứ (?:hai|ba|tư|năm|sáu|bảy)|chủ nhật|cuối tuần|ngày\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?/gu, '')
    .replace(/(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:phút|tiếng|giờ)\s+nữa|\d{1,2}(?:h\d{0,2}|:\d{2}|\s*giờ)/gu, '')
    .replace(/(?:^|\s)(?:lúc|vào|sáng|chiều|tối|nhớ|hãy|xin|làm ơn|tôi muốn|tao muốn|please|tomorrow|today)(?=\s|$)/gu, '')
    .replace(/[\s,.:!]+/gu, '')
  if (prefix)
    return 'uncertain'
  return /hỏi|check\s+xem/u.test(action[0]) ? 'follow_up' : 'create'
}
