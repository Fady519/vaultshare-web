import { fromBase64, randomBytes, toBase64 } from './encoding'
import { derivePasswordKeys } from './kdf'
import { SALT_BYTES, type KdfParams } from './params'
import {
  exportPrivateKey,
  exportPublicKey,
  fingerprint,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  rsaDecrypt,
  rsaEncrypt,
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

type Salts = { saltAuth: string; saltWrap: string }

/*
  Changing the password while signed in. The key in memory is non-extractable
  on purpose, so the sealed copy is opened with the current password and sealed
  again under the new one. Throws DecryptError when the current password is wrong.
*/
export async function changePasswordSecrets(
  current: string,
  salts: Salts,
  sealedPrivateKeyB64: string,
  next: string,
) {
  const old = await passwordSecrets(current, salts.saltAuth, salts.saltWrap)
  const pkcs8 = await open(old.wrapKey, fromBase64(sealedPrivateKeyB64))
  try {
    const fresh = await newPasswordSecrets(next)
    return {
      currentVerifier: old.verifier,
      saltAuth: fresh.saltAuth,
      saltWrap: fresh.saltWrap,
      verifier: fresh.verifier,
      sealedPrivateKey: toBase64(await seal(fresh.wrapKey, pkcs8)),
    }
  } finally {
    pkcs8.fill(0)
  }
}

// twelve new words for the same key; the old kit stops working once the server keeps this one
export async function newRecoveryKit(
  password: string,
  salts: Salts,
  sealedPrivateKeyB64: string,
  words: string[],
) {
  const { wrapKey } = await passwordSecrets(password, salts.saltAuth, salts.saltWrap)
  const pkcs8 = await open(wrapKey, fromBase64(sealedPrivateKeyB64))
  try {
    return toBase64(await sealWithPhrase(words, pkcs8))
  } finally {
    pkcs8.fill(0)
  }
}

/*
  Key-pair rotation: a new RSA-4096 pair, sealed under the same password and a
  new recovery kit, and every data key I hold re-wrapped from the old private
  key to the new public key. File ciphertext isn't touched, so it's quick.
*/
export async function rotateKeyPair(
  oldPrivateKey: CryptoKey,
  password: string,
  salts: Salts,
  sealedPrivateKeyB64: string,
  words: string[],
  wrapped: { versionId: string; wrapped: string }[],
  onProgress?: (done: number) => void,
) {
  const { wrapKey } = await passwordSecrets(password, salts.saltAuth, salts.saltWrap)
  // proves the password before anything new is sealed under it
  const check = await open(wrapKey, fromBase64(sealedPrivateKeyB64))
  check.fill(0)

  const next = await runKeyCeremony(wrapKey, words)
  const publicKey = await importPublicKey(fromBase64(next.publicKey))
  const rewrapped: { versionId: string; wrapped: string }[] = []
  for (const [i, w] of wrapped.entries()) {
    const raw = await rsaDecrypt(oldPrivateKey, fromBase64(w.wrapped))
    try {
      rewrapped.push({
        versionId: w.versionId,
        wrapped: toBase64(await rsaEncrypt(publicKey, raw)),
      })
    } finally {
      raw.fill(0)
    }
    onProgress?.(i + 1)
  }
  return { ...next, rewrapped }
}

// a brand new pair, nothing carried over (danger zone: reset)
export async function resetKeyPair(
  password: string,
  salts: Salts,
  sealedPrivateKeyB64: string,
  words: string[],
) {
  const { wrapKey } = await passwordSecrets(password, salts.saltAuth, salts.saltWrap)
  const check = await open(wrapKey, fromBase64(sealedPrivateKeyB64))
  check.fill(0)
  return runKeyCeremony(wrapKey, words)
}
