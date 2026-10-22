import { describe, expect, it } from 'vitest'
import {
  fromBase64,
  fromBase64Url,
  fromHex,
  randomBytes,
  toBase64,
  toBase64Url,
  toHex,
  utf8,
} from './encoding'
import { DecryptError } from './errors'
import { derivePasswordKeys, hkdfAesKey } from './kdf'
import { open, seal } from './seal'
import {
  fingerprint,
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  rsaDecrypt,
  rsaEncrypt,
} from './rsa'
import { isValidPhrase, newRecoveryPhrase, openWithPhrase, sealWithPhrase } from './recovery'
import {
  newPasswordSecrets,
  passwordSecrets,
  rewrapWithNewPassword,
  runKeyCeremony,
  unsealPrivateKey,
} from './account'

// cheaper params so the suite runs in seconds; the real ones are tested once below
const FAST = { alg: 'argon2id', m: 1024, t: 1, p: 1 } as const

async function testKey() {
  return hkdfAesKey(randomBytes(32), new Uint8Array(0), 'test')
}

describe('encoding', () => {
  it('round-trips base64, base64url and hex', () => {
    const bytes = randomBytes(37)
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    expect(fromHex(toHex(bytes))).toEqual(bytes)
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/)
  })
})

describe('seal / open (AES-256-GCM)', () => {
  it('opens what it sealed', async () => {
    const key = await testKey()
    const blob = await seal(key, utf8('top secret'))
    expect(new TextDecoder().decode(await open(key, blob))).toBe('top secret')
  })

  it('uses a fresh IV every time', async () => {
    const key = await testKey()
    const a = await seal(key, utf8('same'))
    const b = await seal(key, utf8('same'))
    expect(toHex(a)).not.toBe(toHex(b))
  })

  it('rejects a single flipped byte', async () => {
    const key = await testKey()
    const blob = await seal(key, utf8('contract.pdf'))
    blob[blob.length - 5] ^= 0x01
    await expect(open(key, blob)).rejects.toBeInstanceOf(DecryptError)
  })

  it('rejects the wrong key and the wrong AAD', async () => {
    const key = await testKey()
    const blob = await seal(key, utf8('x'), utf8('file-1|v1|0'))
    await expect(open(await testKey(), blob, utf8('file-1|v1|0'))).rejects.toBeInstanceOf(
      DecryptError,
    )
    await expect(open(key, blob, utf8('file-1|v1|1'))).rejects.toBeInstanceOf(DecryptError)
  })
})

describe('password keys (Argon2id + HKDF)', () => {
  it('is deterministic for the same password and salts', async () => {
    const saltAuth = randomBytes(16)
    const saltWrap = randomBytes(16)
    const a = await derivePasswordKeys('correct horse', saltAuth, saltWrap, FAST)
    const b = await derivePasswordKeys('correct horse', saltAuth, saltWrap, FAST)
    expect(toHex(a.verifier)).toBe(toHex(b.verifier))

    // both wrap keys open each other's blobs
    const blob = await seal(a.wrapKey, utf8('private key'))
    await expect(open(b.wrapKey, blob)).resolves.toBeTruthy()
  })

  it('gives a different verifier for a different password', async () => {
    const saltAuth = randomBytes(16)
    const saltWrap = randomBytes(16)
    const a = await derivePasswordKeys('correct horse', saltAuth, saltWrap, FAST)
    const b = await derivePasswordKeys('correct horsf', saltAuth, saltWrap, FAST)
    expect(toHex(a.verifier)).not.toBe(toHex(b.verifier))
  })

  it('works with the real parameters (64 MiB, t=3, p=4)', async () => {
    const s = await newPasswordSecrets('northgate-vault-2026')
    const again = await passwordSecrets('northgate-vault-2026', s.saltAuth, s.saltWrap)
    expect(again.verifier).toBe(s.verifier)
    expect(fromBase64(s.verifier)).toHaveLength(32)
  })
})

describe('RSA-4096-OAEP', () => {
  it('wraps a data key for a public key and unwraps it with the private key', async () => {
    const pair = await generateKeyPair()
    const spki = await exportPublicKey(pair.publicKey)
    const dataKey = randomBytes(32)
    const envelope = await rsaEncrypt(await importPublicKey(spki), dataKey)
    expect(envelope).toHaveLength(512)
    expect(await rsaDecrypt(pair.privateKey, envelope)).toEqual(dataKey)
  })

  it('formats the fingerprint as 8 groups of 4 hex chars', async () => {
    expect(await fingerprint(randomBytes(550))).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/)
  })
})

describe('recovery kit', () => {
  it('makes 12 valid words', () => {
    const words = newRecoveryPhrase()
    expect(words).toHaveLength(12)
    expect(isValidPhrase(words)).toBe(true)
  })

  // the checksum is 4 bits, so it catches ~15 of 16 typos. fixed vectors keep the test stable
  it('checks the BIP-39 checksum', () => {
    expect(isValidPhrase('abandon '.repeat(11) + 'about')).toBe(true)
    expect(isValidPhrase('abandon '.repeat(12))).toBe(false)
    expect(isValidPhrase('abandon '.repeat(11) + 'notaword')).toBe(false)
    expect(isValidPhrase('abandon about')).toBe(false)
  })

  it('opens only with the right words', async () => {
    const words = newRecoveryPhrase()
    const blob = await sealWithPhrase(words, utf8('pkcs8 bytes'))
    expect(new TextDecoder().decode(await openWithPhrase(words.join('  '), blob))).toBe(
      'pkcs8 bytes',
    )
    await expect(openWithPhrase(newRecoveryPhrase(), blob)).rejects.toBeInstanceOf(DecryptError)
  })
})

describe('account flows', () => {
  it('ceremony -> unlock -> recovery with a new password', async () => {
    const pw = await newPasswordSecrets('first-password-123')
    const words = newRecoveryPhrase()
    const steps: string[] = []
    const keys = await runKeyCeremony(pw.wrapKey, words, (s) => steps.push(s))
    expect(steps).toEqual(['keypair', 'seal', 'recovery', 'done'])

    // a challenge the server encrypts to the public key
    const challenge = randomBytes(32)
    const sealedChallenge = await rsaEncrypt(
      await importPublicKey(fromBase64(keys.publicKey)),
      challenge,
    )

    const unlocked = await unsealPrivateKey(pw.wrapKey, keys.sealedPrivateKey)
    expect(await rsaDecrypt(unlocked, sealedChallenge)).toEqual(challenge)

    // forgot the password: the 12 words get the same private key back
    const rewrapped = await rewrapWithNewPassword(
      words,
      keys.sealedRecoveryKey,
      'second-password-456',
    )
    expect(await rsaDecrypt(rewrapped.privateKey, sealedChallenge)).toEqual(challenge)

    // the old password no longer opens the new blob
    await expect(unsealPrivateKey(pw.wrapKey, rewrapped.sealedPrivateKey)).rejects.toBeInstanceOf(
      DecryptError,
    )
  })
})
