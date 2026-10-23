import { buf, concatBytes, fromBase64, fromUtf8, randomBytes, toBase64, utf8 } from './encoding'
import { DecryptError } from './errors'
import { IV_BYTES, KEY_BYTES, TAG_BYTES } from './params'
import { importPublicKey, rsaDecrypt, rsaEncrypt } from './rsa'
import { asDecryptError, gcmParams } from './seal'

/*
  File encryption (FR-10, FR-11, UC-02):
  - every version gets its own random 256-bit data key
  - the file is cut in 4 MiB chunks, each sealed with AES-256-GCM, a fresh IV,
    and AAD = "fileId|versionId|index" so chunks can't be reordered or moved
    to another file without the tag check failing
  - the data key is wrapped once per member with RSA-4096-OAEP
  - the file name (and the optional version note) are sealed with the same key
*/

export const CHUNK_SIZE = 4 * 1024 * 1024

export class IntegrityError extends Error {
  index: number
  constructor(index: number, reason: string) {
    super(`Chunk ${index + 1} failed the integrity check: ${reason}`)
    this.name = 'IntegrityError'
    this.index = index
  }
}

export const chunkCountFor = (size: number) => Math.max(1, Math.ceil(size / CHUNK_SIZE))

export const chunkAad = (fileId: string, versionId: string, index: number) =>
  utf8(`${fileId}|${versionId}|${index}`)

export const nameAad = (fileId: string) => utf8(`${fileId}|name`)
export const noteAad = (versionId: string) => utf8(`${versionId}|note`)

export function importAesKey(raw: Uint8Array) {
  return crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

// raw is handed back only so it can be wrapped for the recipients; zero it right after
export async function newDataKey() {
  const raw = randomBytes(KEY_BYTES)
  return { raw, key: await importAesKey(raw) }
}

export async function wrapDataKey(raw: Uint8Array, publicKeyB64: string) {
  const publicKey = await importPublicKey(fromBase64(publicKeyB64))
  return toBase64(await rsaEncrypt(publicKey, raw))
}

// the unwrapped key only ever exists as a non-extractable CryptoKey
export async function unwrapDataKey(privateKey: CryptoKey, wrappedB64: string) {
  const raw = await rsaDecrypt(privateKey, fromBase64(wrappedB64))
  try {
    return await importAesKey(raw)
  } finally {
    raw.fill(0)
  }
}

/*
  Moving a file to another vault: the same data key, wrapped again for the new
  member set. The raw key exists only inside this function and is zeroed after.
*/
export function rewrapDataKey(
  privateKey: CryptoKey,
  wrappedB64: string,
  recipients: { userId: string; publicKey: string }[],
) {
  return withRawDataKey(privateKey, wrappedB64, (raw) =>
    Promise.all(
      recipients.map(async (r) => ({
        userId: r.userId,
        wrapped: await wrapDataKey(raw, r.publicKey),
      })),
    ),
  )
}

// the raw key for the length of `fn` only (re-wrapping for a share or a link), zeroed after
export async function withRawDataKey<T>(
  privateKey: CryptoKey,
  wrappedB64: string,
  fn: (raw: Uint8Array) => Promise<T>,
) {
  const raw = await rsaDecrypt(privateKey, fromBase64(wrappedB64))
  try {
    return await fn(raw)
  } finally {
    raw.fill(0)
  }
}

export async function sha256(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf(bytes)))
}

// one value per version: SHA-256 over the chunk digests, all computed on ciphertext
export const versionDigest = (chunkDigests: Uint8Array[]) => sha256(concatBytes(...chunkDigests))

export async function encryptChunk(key: CryptoKey, plain: Uint8Array, aad: Uint8Array) {
  const iv = randomBytes(IV_BYTES)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(gcmParams(iv, aad), key, buf(plain)),
  )
  return {
    ciphertext,
    iv,
    tag: ciphertext.slice(ciphertext.length - TAG_BYTES),
    digest: await sha256(ciphertext),
  }
}

export async function decryptChunk(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
) {
  try {
    return new Uint8Array(await crypto.subtle.decrypt(gcmParams(iv, aad), key, buf(ciphertext)))
  } catch (err) {
    throw asDecryptError(err)
  }
}

// names and notes: small strings, sealed with the version's data key
export async function encryptText(key: CryptoKey, text: string, aad: Uint8Array) {
  const iv = randomBytes(IV_BYTES)
  const ct = await crypto.subtle.encrypt(gcmParams(iv, aad), key, utf8(text))
  return { enc: toBase64(new Uint8Array(ct)), iv: toBase64(iv) }
}

export async function decryptText(key: CryptoKey, encB64: string, ivB64: string, aad: Uint8Array) {
  try {
    const pt = await crypto.subtle.decrypt(
      gcmParams(fromBase64(ivB64), aad),
      key,
      fromBase64(encB64),
    )
    return fromUtf8(new Uint8Array(pt))
  } catch (err) {
    const e = asDecryptError(err)
    throw e instanceof DecryptError ? new DecryptError('Could not decrypt this name') : e
  }
}
