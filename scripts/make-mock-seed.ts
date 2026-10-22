/*
  Generates real key material for the demo users of the mock server, with the
  same crypto code the app uses. Run once (it's slow on purpose, Argon2id):

    npx vite-node scripts/make-mock-seed.ts

  Output: src/mocks/seed-keys.json
*/
import { writeFileSync } from 'node:fs'
import { newPasswordSecrets, runKeyCeremony } from '../src/crypto/account'
import { fromBase64, toHex } from '../src/crypto/encoding'
import { newRecoveryPhrase } from '../src/crypto/recovery'

const PASSWORD = 'northgate-vault-2026'
const USERS = ['jack', 'maya', 'ilan', 'sam']
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function totpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  return (bits.match(/.{5}/g) ?? []).map((c) => BASE32[parseInt(c, 2)]).join('')
}

async function sha256Hex(b64: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64(b64))))
}

const out: Record<string, unknown> = {}

for (const name of USERS) {
  const secrets = await newPasswordSecrets(PASSWORD)
  const words = newRecoveryPhrase()
  const keys = await runKeyCeremony(secrets.wrapKey, words)
  out[name] = {
    password: PASSWORD,
    saltAuth: secrets.saltAuth,
    saltWrap: secrets.saltWrap,
    verifierHash: await sha256Hex(secrets.verifier),
    publicKey: keys.publicKey,
    sealedPrivateKey: keys.sealedPrivateKey,
    sealedRecoveryKey: keys.sealedRecoveryKey,
    fingerprint: keys.fingerprint,
    recoveryWords: words.join(' '),
    totpSecret: totpSecret(),
  }
  console.log(`${name}: ${keys.fingerprint}`)
}

writeFileSync('src/mocks/seed-keys.json', JSON.stringify(out, null, 2) + '\n')
console.log('wrote src/mocks/seed-keys.json')
