import { buf, toHex } from './encoding'
import { DecryptError } from './errors'
import { RSA } from './params'

export function generateKeyPair() {
  // extractable only so the private half can be sealed once, right after this
  return crypto.subtle.generateKey(RSA, true, ['encrypt', 'decrypt']) as Promise<CryptoKeyPair>
}

export async function exportPublicKey(key: CryptoKey) {
  return new Uint8Array(await crypto.subtle.exportKey('spki', key))
}

export async function exportPrivateKey(key: CryptoKey) {
  return new Uint8Array(await crypto.subtle.exportKey('pkcs8', key))
}

export function importPublicKey(spki: Uint8Array) {
  return crypto.subtle.importKey('spki', buf(spki), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt',
  ])
}

// the copy kept in memory is non-extractable: even our own JS can't read it back out
export function importPrivateKey(pkcs8: Uint8Array) {
  return crypto.subtle.importKey(
    'pkcs8',
    buf(pkcs8),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  )
}

export async function rsaEncrypt(publicKey: CryptoKey, data: Uint8Array) {
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, buf(data)))
}

export async function rsaDecrypt(privateKey: CryptoKey, data: Uint8Array) {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, buf(data)))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'OperationError') {
      throw new DecryptError('This key cannot open that envelope')
    }
    throw err
  }
}

// first 16 bytes of SHA-256(spki), as "cd3b 8cbc f539 ..." — same as the server computes
export async function fingerprint(spki: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(spki)))
  return toHex(hash.slice(0, 16)).match(/.{4}/g)!.join(' ')
}
