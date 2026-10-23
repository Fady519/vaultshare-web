import { describe, expect, it } from 'vitest'
import { fromBase64 } from './encoding'
import { DecryptError } from './errors'
import { importPublicKey, rsaDecrypt, rsaEncrypt } from './rsa'
import { newRecoveryPhrase } from './recovery'
import {
  changePasswordSecrets,
  checkRecoveryKit,
  newPasswordSecrets,
  newRecoveryKit,
  passwordSecrets,
  rotateKeyPair,
  runKeyCeremony,
  unsealPrivateKey,
} from './account'
import { newDataKey, unwrapDataKey, wrapDataKey } from './files'

async function account(password: string) {
  const pw = await newPasswordSecrets(password)
  const words = newRecoveryPhrase()
  const keys = await runKeyCeremony(pw.wrapKey, words)
  return { pw, words, keys, salts: { saltAuth: pw.saltAuth, saltWrap: pw.saltWrap } }
}

describe('settings: password, recovery kit, key rotation', () => {
  it('changes the password and keeps the same private key', async () => {
    const a = await account('old-password-123')
    const next = await changePasswordSecrets(
      'old-password-123',
      a.salts,
      a.keys.sealedPrivateKey,
      'new-password-456',
    )
    // the server can check the old verifier against what it stored at sign-up
    expect(next.currentVerifier).toBe(a.pw.verifier)

    const fresh = await passwordSecrets('new-password-456', next.saltAuth, next.saltWrap)
    expect(fresh.verifier).toBe(next.verifier)
    const unlocked = await unsealPrivateKey(fresh.wrapKey, next.sealedPrivateKey)
    const probe = await rsaEncrypt(
      await importPublicKey(fromBase64(a.keys.publicKey)),
      new Uint8Array([7, 7, 7]),
    )
    expect(await rsaDecrypt(unlocked, probe)).toEqual(new Uint8Array([7, 7, 7]))

    await expect(
      changePasswordSecrets('wrong-password', a.salts, a.keys.sealedPrivateKey, 'whatever-123'),
    ).rejects.toBeInstanceOf(DecryptError)
  }, 60_000)

  it('makes a new recovery kit for the same key', async () => {
    const a = await account('kit-password-123')
    const words = newRecoveryPhrase()
    const sealed = await newRecoveryKit('kit-password-123', a.salts, a.keys.sealedPrivateKey, words)
    await expect(checkRecoveryKit(words, sealed)).resolves.toBeUndefined()
    await expect(checkRecoveryKit(a.words, sealed)).rejects.toBeInstanceOf(DecryptError)
  }, 60_000)

  it('rotates the key pair and re-wraps every data key', async () => {
    const a = await account('rotate-password-1')
    const { raw } = await newDataKey()
    const before = await wrapDataKey(raw, a.keys.publicKey)
    const words = newRecoveryPhrase()

    const rotated = await rotateKeyPair(
      a.keys.privateKey,
      'rotate-password-1',
      a.salts,
      a.keys.sealedPrivateKey,
      words,
      [{ versionId: 'v1', wrapped: before }],
    )
    expect(rotated.fingerprint).not.toBe(a.keys.fingerprint)
    // the new private key opens the re-wrapped copy, the old one doesn't
    await expect(
      unwrapDataKey(rotated.privateKey, rotated.rewrapped[0].wrapped),
    ).resolves.toBeDefined()
    await expect(
      unwrapDataKey(a.keys.privateKey, rotated.rewrapped[0].wrapped),
    ).rejects.toBeInstanceOf(DecryptError)
    await expect(checkRecoveryKit(words, rotated.sealedRecoveryKey)).resolves.toBeUndefined()
  }, 90_000)
})
