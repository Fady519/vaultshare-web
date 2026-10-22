/*
  Local password strength estimate (UC-01 step 2: the browser refuses weak input).
  Runs entirely here, nothing about the password is sent anywhere.

  It's an estimate of guessing entropy: length × log2(alphabet), minus penalties
  for the patterns attackers try first. Good enough to stop "Password123!".
*/

const COMMON = [
  'password',
  'passw0rd',
  'qwerty',
  'azerty',
  'letmein',
  'welcome',
  'admin',
  'login',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'secret',
  'vault',
  'vaultshare',
  '123456',
  '654321',
  '111111',
  '000000',
  'abc123',
  'abcdef',
]

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiopasdfghjklzxcvbnm']

export type Strength = {
  bits: number
  score: 0 | 1 | 2 | 3 | 4
  label: 'too short' | 'weak' | 'fair' | 'good' | 'strong'
  acceptable: boolean
  hint: string | null
}

export const MIN_LENGTH = 12

function hasSequence(pw: string) {
  const lower = pw.toLowerCase()
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 4 <= seq.length; i++) {
      if (lower.includes(seq.slice(i, i + 4))) return true
    }
  }
  return false
}

export function passwordStrength(pw: string, email = ''): Strength {
  if (pw.length < MIN_LENGTH) {
    return {
      bits: 0,
      score: 0,
      label: 'too short',
      acceptable: false,
      hint: `Use at least ${MIN_LENGTH} characters. A few unrelated words work well.`,
    }
  }

  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33

  let bits = pw.length * Math.log2(Math.max(pool, 1))
  let hint: string | null = null

  const unique = new Set(pw).size / pw.length
  if (unique < 0.5) {
    bits *= 0.6
    hint = 'Lots of repeated characters.'
  }
  const lower = pw.toLowerCase()
  if (COMMON.some((w) => lower.includes(w))) {
    bits -= 30
    hint = 'Contains a very common password.'
  }
  if (hasSequence(pw)) {
    bits -= 15
    hint = hint ?? 'Avoid sequences like "abcd" or "1234".'
  }
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) {
    bits -= 30
    hint = 'Don’t use your email address in the password.'
  }

  bits = Math.max(0, Math.round(bits))
  const score = bits < 45 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4
  const label = (['too short', 'weak', 'fair', 'good', 'strong'] as const)[score]
  return { bits, score, label, acceptable: score >= 3, hint }
}
