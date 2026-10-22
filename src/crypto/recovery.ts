import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { argon2id, hkdfAesKey } from './kdf'
import { buf, concatBytes, randomBytes } from './encoding'
import { DecryptError } from './errors'
import { asDecryptError } from './seal'
import { BLOB_VERSION, INFO, IV_BYTES, KDF, SALT_BYTES } from './params'

/*
  The recovery kit: 12 BIP-39 words (128 bits + checksum) made in the browser.
  They seal a second copy of the private key, so a forgotten password is not
  the end. The words are never sent anywhere.

  blob: [version][salt 16][iv 12][ciphertext + tag]
*/

export function newRecoveryPhrase() {
  return generateMnemonic(wordlist, 128).split(' ')
}

export function normalizePhrase(words: string[] | string) {
  const list = Array.isArray(words) ? words : words.split(/\s+/)
  return list
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

// the BIP-39 checksum catches a mistyped word before we even try to decrypt
export function isValidPhrase(words: string[] | string) {
  const phrase = normalizePhrase(words)
  return phrase.split(' ').length === 12 && validateMnemonic(phrase, wordlist)
}

export function isKnownWord(word: string) {
  return wordlist.includes(word.trim().toLowerCase())
}

async function recoveryKey(words: string[] | string, salt: Uint8Array) {
  const master = await argon2id(normalizePhrase(words), salt, KDF)
  try {
    return await hkdfAesKey(master, new Uint8Array(0), INFO.recovery)
  } finally {
    master.fill(0)
  }
}

export async function sealWithPhrase(words: string[], secret: Uint8Array) {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await recoveryKey(words, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf(secret))
  return concatBytes(new Uint8Array([BLOB_VERSION]), salt, iv, new Uint8Array(ct))
}

export async function openWithPhrase(words: string[] | string, blob: Uint8Array) {
  if (blob[0] !== BLOB_VERSION) throw new DecryptError('Unknown blob format')
  const salt = blob.slice(1, 1 + SALT_BYTES)
  const iv = blob.slice(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES)
  const ct = blob.slice(1 + SALT_BYTES + IV_BYTES)
  const key = await recoveryKey(words, salt)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
  } catch (err) {
    throw asDecryptError(err, 'These words do not open this recovery kit')
  }
}
