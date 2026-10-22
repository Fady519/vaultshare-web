import { buf, concatBytes, randomBytes } from './encoding'
import { DecryptError } from './errors'
import { BLOB_VERSION, IV_BYTES } from './params'

/*
  AES-256-GCM "sealed blob":  [version 1B][iv 12B][ciphertext + 16B tag]
  used for the private key (under the wrap key) and anything else small.
*/

export async function seal(key: CryptoKey, plaintext: Uint8Array, aad?: Uint8Array) {
  const iv = randomBytes(IV_BYTES)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad ? buf(aad) : undefined },
    key,
    buf(plaintext),
  )
  return concatBytes(new Uint8Array([BLOB_VERSION]), iv, new Uint8Array(ct))
}

export async function open(key: CryptoKey, blob: Uint8Array, aad?: Uint8Array) {
  if (blob[0] !== BLOB_VERSION) throw new DecryptError('Unknown blob format')
  const iv = blob.slice(1, 1 + IV_BYTES)
  const ct = blob.slice(1 + IV_BYTES)
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad ? buf(aad) : undefined },
      key,
      ct,
    )
    return new Uint8Array(pt)
  } catch {
    throw new DecryptError()
  }
}
