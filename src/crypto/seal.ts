import { buf, concatBytes, randomBytes } from './encoding'
import { DecryptError } from './errors'
import { BLOB_VERSION, IV_BYTES } from './params'

/*
  AES-256-GCM "sealed blob":  [version 1B][iv 12B][ciphertext + 16B tag]
  used for the private key (under the wrap key) and anything else small.
*/

// leave additionalData out entirely when there is none: Chrome rejects `undefined` there
export function gcmParams(iv: Uint8Array, aad?: Uint8Array): AesGcmParams {
  return aad ? { name: 'AES-GCM', iv, additionalData: buf(aad) } : { name: 'AES-GCM', iv }
}

// only a failed tag check is a DecryptError; anything else is a bug and should surface as one
export function asDecryptError(err: unknown, message?: string) {
  return err instanceof DOMException && err.name === 'OperationError'
    ? new DecryptError(message)
    : err
}

export async function seal(key: CryptoKey, plaintext: Uint8Array, aad?: Uint8Array) {
  const iv = randomBytes(IV_BYTES)
  const ct = await crypto.subtle.encrypt(gcmParams(iv, aad), key, buf(plaintext))
  return concatBytes(new Uint8Array([BLOB_VERSION]), iv, new Uint8Array(ct))
}

export async function open(key: CryptoKey, blob: Uint8Array, aad?: Uint8Array) {
  if (blob[0] !== BLOB_VERSION) throw new DecryptError('Unknown blob format')
  const iv = blob.slice(1, 1 + IV_BYTES)
  const ct = blob.slice(1 + IV_BYTES)
  try {
    return new Uint8Array(await crypto.subtle.decrypt(gcmParams(iv, aad), key, ct))
  } catch (err) {
    throw asDecryptError(err)
  }
}
