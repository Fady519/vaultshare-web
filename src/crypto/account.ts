import { fromBase64, randomBytes, toBase64 } from './encoding'
import { derivePasswordKeys } from './kdf'
import { SALT_BYTES, type KdfParams } from './params'
import {
  exportPrivateKey,
  exportPublicKey,
  fingerprint,
  generateKeyPair,
  importPrivateKey,
} from './rsa'
import { open, seal } from './seal'
import { openWithPhrase, sealWithPhrase } from './recovery'

/*
  The account-level flows built from the primitives: what sign-up, the key
  ceremony, sign-in and recovery each need. Pages only call these.
*/

// sign-up: fresh salts + the verifier to send + the wrap key to keep in memory
export async function newPasswordSecrets(password: string) {
  const saltAuth = randomBytes(SALT_BYTES)
  const saltWrap = randomBytes(SALT_BYTES)
  const { verifier, wrapKey } = await derivePasswordKeys(password, saltAuth, saltWrap)
  return {
    saltAuth: toBase64(saltAuth),
    saltWrap: toBase64(saltWrap),
    verifier: toBase64(verifier),
    wrapKey,
  }
}

// sign-in: same derivation with the salts the server handed back
export async function passwordSecrets(
  password: string,
  saltAuthB64: string,
  saltWrapB64: string,
  params?: KdfParams,
) {
  const { verifier, wrapKey } = await derivePasswordKeys(
    password,
    fromBase64(saltAuthB64),
    fromBase64(saltWrapB64),
    params,
  )
  return { verifier: toBase64(verifier), wrapKey }
}

export type CeremonyStep = 'keypair' | 'seal' | 'recovery' | 'done'

/*
  The key ceremony (UC-01 steps 6-10):
  generate RSA-4096 -> seal private key with the wrap key -> seal a second copy
  with the recovery words. Only the public key and the two sealed blobs leave.
*/
export async function runKeyCeremony(
  wrapKey: CryptoKey,
  recoveryWords: string[],
  onStep?: (step: CeremonyStep, ms: number) => void,
) {
  let t = performance.now()
  const tick = (step: CeremonyStep) => {
    const now = performance.now()
    onStep?.(step, Math.round(now - t))
    t = now
  }

  const pair = await generateKeyPair()
  const spki = await exportPublicKey(pair.publicKey)
  const pkcs8 = await exportPrivateKey(pair.privateKey)
  tick('keypair')

  try {
    const sealedPrivateKey = await seal(wrapKey, pkcs8)
    tick('seal')

    const sealedRecoveryKey = await sealWithPhrase(recoveryWords, pkcs8)
    tick('recovery')

    const privateKey = await importPrivateKey(pkcs8)
    const result = {
      publicKey: toBase64(spki),
      sealedPrivateKey: toBase64(sealedPrivateKey),
      sealedRecoveryKey: toBase64(sealedRecoveryKey),
      fingerprint: await fingerprint(spki),
      privateKey,
    }
    tick('done')
    return result
  } finally {
    pkcs8.fill(0)
  }
}

// unlock: open the sealed private key, keep only a non-extractable copy
export async function unsealPrivateKey(wrapKey: CryptoKey, sealedPrivateKeyB64: string) {
  const pkcs8 = await open(wrapKey, fromBase64(sealedPrivateKeyB64))
  try {
    return await importPrivateKey(pkcs8)
  } finally {
    pkcs8.fill(0)
  }
}

/*
  Recovery with the 12 words: open the recovery copy, then re-seal it under a
  new password. Returns the pieces /auth/recovery/complete needs.
*/
export async function rewrapWithNewPassword(
  recoveryWords: string[],
  sealedRecoveryKeyB64: string,
  newPassword: string,
) {
  const pkcs8 = await openWithPhrase(recoveryWords, fromBase64(sealedRecoveryKeyB64))
  try {
    const secrets = await newPasswordSecrets(newPassword)
    const sealedPrivateKey = await seal(secrets.wrapKey, pkcs8)
    const privateKey = await importPrivateKey(pkcs8)
    return {
      saltAuth: secrets.saltAuth,
      saltWrap: secrets.saltWrap,
      verifier: secrets.verifier,
      sealedPrivateKey: toBase64(sealedPrivateKey),
      privateKey,
    }
  } finally {
    pkcs8.fill(0)
  }
}

// step 1 of recovery: prove the words open the kit before asking for a new password
export async function checkRecoveryKit(recoveryWords: string[], sealedRecoveryKeyB64: string) {
  const pkcs8 = await openWithPhrase(recoveryWords, fromBase64(sealedRecoveryKeyB64))
  pkcs8.fill(0)
}
