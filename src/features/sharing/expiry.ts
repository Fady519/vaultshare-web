const WEEK = 7 * 86_400_000

// green while there's more than a week, amber inside a week, red once it's run out
export function expiryLevel(expiresAt: string | null): 'ok' | 'warn' | 'danger' {
  if (!expiresAt) return 'ok'
  const left = new Date(expiresAt).getTime() - Date.now()
  return left <= 0 ? 'danger' : left <= WEEK ? 'warn' : 'ok'
}

export const expiresWithinWeek = (expiresAt: string | null) =>
  expiresAt !== null && expiryLevel(expiresAt) !== 'ok'
