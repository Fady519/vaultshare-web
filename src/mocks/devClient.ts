import type { MockMail } from './db'

// talks to the /__dev endpoints that only the mock server has
export const mocksOn = import.meta.env.VITE_USE_MOCKS === 'true'

export async function fetchOutbox(to: string): Promise<MockMail[]> {
  const res = await fetch(`/__dev/outbox?to=${encodeURIComponent(to)}`)
  return res.ok ? res.json() : []
}

export async function fetchTotp(
  email: string,
): Promise<{ code: string | null; secondsLeft: number }> {
  const res = await fetch(`/__dev/totp?email=${encodeURIComponent(email)}`)
  return res.ok ? res.json() : { code: null, secondsLeft: 0 }
}

export async function tamperState(versionId: string): Promise<boolean> {
  const res = await fetch(`/__dev/tamper?versionId=${versionId}`)
  return res.ok ? (await res.json()).tampered : false
}

export async function toggleTamper(versionId: string): Promise<boolean> {
  const res = await fetch(`/__dev/tamper?versionId=${versionId}`, { method: 'POST' })
  return res.ok ? (await res.json()).tampered : false
}
