/// <reference lib="webworker" />
import { argon2Raw } from './argon2'
import type { KdfParams } from './params'

type Job = { id: number; password: Uint8Array; salt: Uint8Array; params: KdfParams }

// Argon2id takes ~1s and 64 MiB on purpose. running it here keeps the page responsive
self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, password, salt, params } = e.data
  try {
    const key = await argon2Raw(password, salt, params)
    password.fill(0)
    self.postMessage({ id, key }, [key.buffer])
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
