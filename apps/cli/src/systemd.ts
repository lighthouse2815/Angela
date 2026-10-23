/** Quotes one systemd ExecStart argument. Unit specifiers and environment expansion must remain literal user data. */
export function unitArgument(value: string) {
  if (/\p{Cc}/u.test(value))
    throw new Error('Invalid service argument')
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/%/gu, '%%').replace(/\$/gu, '$$$$')}"`
}
