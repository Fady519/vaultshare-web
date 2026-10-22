// every parameter in one place, justified in section 3.10 of the book

export const KDF = {
  alg: 'argon2id',
  m: 65536, // KiB = 64 MiB
  t: 3,
  p: 4,
} as const

export type KdfParams = { alg: 'argon2id'; m: number; t: number; p: number }

export const SALT_BYTES = 16
export const KEY_BYTES = 32
export const IV_BYTES = 12
export const TAG_BYTES = 16

export const RSA = {
  name: 'RSA-OAEP',
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const

// HKDF context strings, so keys derived for different jobs never collide
export const INFO = {
  auth: 'vs:auth:v1',
  wrap: 'vs:wrap:v1',
  recovery: 'vs:recovery:v1',
} as const

// first byte of every sealed blob, lets us change the format later
export const BLOB_VERSION = 1
