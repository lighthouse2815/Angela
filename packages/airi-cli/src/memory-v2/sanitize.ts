/**
 * Removes common credentials and terminal controls before durable storage, then bounds the sanitized text.
 * @example
 * sanitize('password=hunter2')
 * // => 'password=[REDACTED]'
 */
export function sanitize(text: string, limit = 4000) {
  // Sanitize before truncation: clipping a PEM or quoted credential first can hide its closing delimiter.
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gu, '[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[\w.+/=-]+/giu, '[REDACTED]')
    .replace(/\b(?:sk-[\w-]{8,}|(?:sk|rk)_live_[\w-]+|gh[pousr]_\w+|github_pat_\w+|xox[abprs]-[\w-]+|xapp-[\w-]+|AIza[\w-]{20,}|AQ\.Ab[\w-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|eyJ[\w+/.=-]{30,})\b/gu, '[REDACTED]')
    .replace(/\b\d{6,10}:[\w-]{30,}\b/gu, '[REDACTED]')
    .replace(/\b[A-Z][A-Z\d+.-]{0,31}:\/\/[^\s/@][^\s/:@]*:[^\s/@]+@\S+/giu, '[REDACTED]')
    .replace(/(["']?\b[\w-]{0,128}(?:password|passwd|secret|token|(?:api|auth|access|secret|private|subscription|account)[_-]?key(?:[_-]?id)?|credentials?|authorization)["']?\s*[:=]\s*)(?:"[^"\n]*(?:"|$)|'[^'\n]*(?:'|$)|[^\s,;}]+)/giu, '$1[REDACTED]')

    .replace(/\u001B\[[\d;?]*[\x20-\x2F]*[\x40-\x7E]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[\u0000-\u0008\v\f\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu, '')
    .slice(0, limit)
}
