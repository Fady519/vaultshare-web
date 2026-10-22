import { argon2id } from 'hash-wasm'
import type { KdfParams } from './params'
import { KEY_BYTES } from './params'

// the raw call, used inside the worker (and directly in tests / node)
export function argon2Raw(password: Uint8Array | string, salt: Uint8Array, params: KdfParams) {
  return argon2id({
    password,
    salt,
    iterations: params.t,
    parallelism: params.p,
    memorySize: params.m,
    hashLength: KEY_BYTES,
    outputType: 'binary',
  })
}
