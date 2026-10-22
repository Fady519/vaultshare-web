// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), so a real authenticator app works against the mock

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function newTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  return (bits.match(/.{5}/g) ?? []).map((c) => BASE32[parseInt(c, 2)]).join('')
}

function base32Decode(secret: string) {
  let bits = ''
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    const v = BASE32.indexOf(ch)
    if (v >= 0) bits += v.toString(2).padStart(5, '0')
  }
  const out = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  return out
}

async function hotp(secret: string, counter: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const msg = new DataView(new ArrayBuffer(8))
  msg.setUint32(0, Math.floor(counter / 2 ** 32))
  msg.setUint32(4, counter >>> 0)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg.buffer))
  const offset = mac[mac.length - 1] & 0xf
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

const step = () => Math.floor(Date.now() / 30_000)

export const currentTotp = (secret: string) => hotp(secret, step())

export const secondsLeft = () => 30 - (Math.floor(Date.now() / 1000) % 30)

// accept one step either side for clock drift
export async function verifyTotp(secret: string, code: string) {
  const clean = code.replace(/\s/g, '')
  for (const drift of [0, -1, 1]) {
    if ((await hotp(secret, step() + drift)) === clean) return true
  }
  return false
}

export function otpauthUri(secret: string, email: string) {
  const label = encodeURIComponent(`VaultShare:${email}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=VaultShare&algorithm=SHA1&digits=6&period=30`
}
