// small byte helpers. the API speaks standard base64, link fragments use base64url

export function toBase64(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function fromBase64(b64: string) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function fromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const utf8 = (text: string) => encoder.encode(text)
export const fromUtf8 = (bytes: Uint8Array) => decoder.decode(bytes)

export function concatBytes(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length))
}

// constant-time compare, for codes and challenges
export function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// WebCrypto wants a view over a plain ArrayBuffer (not a shared one / a slice of a bigger one)
export function buf(bytes: Uint8Array): Uint8Array {
  return bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0
    ? bytes
    : new Uint8Array(bytes)
}
