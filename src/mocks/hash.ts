import { fromBase64, toHex, utf8 } from '@/crypto/encoding'

// stands in for the server-side Argon2id of verifiers and codes. it's a mock,
// the point is only that the plain value is never stored
export async function sha256Hex(data: string | Uint8Array) {
  const bytes = typeof data === 'string' ? utf8(data) : data
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

export const hashVerifier = (verifierB64: string) => sha256Hex(fromBase64(verifierB64))

export const hashCode = (code: string) => sha256Hex(code.replace(/[\s-]/g, '').toUpperCase())

export function randomToken(bytes = 24) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}
