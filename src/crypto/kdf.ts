import { argon2Raw } from './argon2'
import { buf, utf8 } from './encoding'
import { INFO, KDF, type KdfParams } from './params'

let worker: Worker | null = null
let nextJob = 1
const pending = new Map<number, { resolve: (k: Uint8Array) => void; reject: (e: Error) => void }>()

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('./argon.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; key?: Uint8Array; error?: string }>) => {
      const job = pending.get(e.data.id)
      if (!job) return
      pending.delete(e.data.id)
      if (e.data.key) job.resolve(e.data.key)
      else job.reject(new Error(e.data.error ?? 'Argon2id failed'))
    }
  }
  return worker
}

// Argon2id(secret, salt) -> 32 bytes. in the browser this runs in a web worker
export function argon2id(secret: string, salt: Uint8Array, params: KdfParams = KDF) {
  const w = getWorker()
  if (!w) return argon2Raw(secret, salt, params)

  return new Promise<Uint8Array>((resolve, reject) => {
    const id = nextJob++
    pending.set(id, { resolve, reject })
    const password = utf8(secret)
    w.postMessage({ id, password, salt, params }, [password.buffer])
  })
}

function hkdfBase(ikm: Uint8Array) {
  return crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits', 'deriveKey'])
}

// raw bytes, for things that get sent (the login verifier)
export async function hkdfBytes(ikm: Uint8Array, salt: Uint8Array, info: string, length = 32) {
  const base = await hkdfBase(ikm)
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: utf8(info) },
    base,
    length * 8,
  )
  return new Uint8Array(bits)
}

// a non-extractable AES-GCM key, for things that never leave memory
export async function hkdfAesKey(ikm: Uint8Array, salt: Uint8Array, info: string) {
  const base = await hkdfBase(ikm)
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: utf8(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export type PasswordKeys = {
  // sent to the server instead of the password
  verifier: Uint8Array
  // seals / opens the private key, never sent
  wrapKey: CryptoKey
}

/*
  masterKey = Argon2id(password, saltWrap)
  verifier  = HKDF(masterKey, saltAuth, "vs:auth:v1")
  wrapKey   = HKDF(masterKey, -,        "vs:wrap:v1")

  HKDF is one-way, so knowing the verifier tells the server nothing about wrapKey.
*/
export async function derivePasswordKeys(
  password: string,
  saltAuth: Uint8Array,
  saltWrap: Uint8Array,
  params: KdfParams = KDF,
): Promise<PasswordKeys> {
  const masterKey = await argon2id(password, saltWrap, params)
  try {
    const verifier = await hkdfBytes(masterKey, saltAuth, INFO.auth)
    const wrapKey = await hkdfAesKey(masterKey, new Uint8Array(0), INFO.wrap)
    return { verifier, wrapKey }
  } finally {
    masterKey.fill(0)
  }
}
