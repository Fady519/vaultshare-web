import { describe, expect, it } from 'vitest'
import { fromBase64, randomBytes, toHex } from './encoding'
import { DecryptError } from './errors'
import { exportPublicKey, generateKeyPair } from './rsa'
import { toBase64 } from './encoding'
import {
  CHUNK_SIZE,
  chunkAad,
  chunkCountFor,
  decryptChunk,
  decryptText,
  encryptChunk,
  encryptText,
  nameAad,
  newDataKey,
  rewrapDataKey,
  sha256,
  unwrapDataKey,
  versionDigest,
  wrapDataKey,
} from './files'

describe('file chunks', () => {
  it('counts chunks of 4 MiB', () => {
    expect(chunkCountFor(0)).toBe(1)
    expect(chunkCountFor(CHUNK_SIZE)).toBe(1)
    expect(chunkCountFor(CHUNK_SIZE + 1)).toBe(2)
    expect(chunkCountFor(4_404_019)).toBe(2) // the book's 4.2 MB example
  })

  it('round-trips a chunk and reports iv, tag and digest', async () => {
    const { key } = await newDataKey()
    const plain = randomBytes(1000)
    const out = await encryptChunk(key, plain, chunkAad('f1', 'v1', 0))
    expect(out.iv).toHaveLength(12)
    expect(out.tag).toHaveLength(16)
    expect(out.ciphertext).toHaveLength(1016)
    expect(toHex(out.digest)).toBe(toHex(await sha256(out.ciphertext)))
    expect(await decryptChunk(key, out.ciphertext, out.iv, chunkAad('f1', 'v1', 0))).toEqual(plain)
  })

  it('rejects a chunk moved to another index, version or file', async () => {
    const { key } = await newDataKey()
    const out = await encryptChunk(key, randomBytes(64), chunkAad('f1', 'v1', 0))
    for (const aad of [chunkAad('f1', 'v1', 1), chunkAad('f1', 'v2', 0), chunkAad('f2', 'v1', 0)]) {
      await expect(decryptChunk(key, out.ciphertext, out.iv, aad)).rejects.toBeInstanceOf(
        DecryptError,
      )
    }
  })

  it('rejects a flipped byte in storage', async () => {
    const { key } = await newDataKey()
    const out = await encryptChunk(key, randomBytes(64), chunkAad('f1', 'v1', 0))
    out.ciphertext[10] ^= 1
    await expect(
      decryptChunk(key, out.ciphertext, out.iv, chunkAad('f1', 'v1', 0)),
    ).rejects.toBeInstanceOf(DecryptError)
  })

  it('makes one version digest from the chunk digests', async () => {
    const a = await sha256(randomBytes(10))
    const b = await sha256(randomBytes(10))
    expect(toHex(await versionDigest([a, b]))).not.toBe(toHex(await versionDigest([b, a])))
  })
})

describe('data key wrapping', () => {
  it('wraps for each recipient and only their private key unwraps it', async () => {
    const alice = await generateKeyPair()
    const bob = await generateKeyPair()
    const { raw, key } = await newDataKey()
    const forAlice = await wrapDataKey(raw, toBase64(await exportPublicKey(alice.publicKey)))
    expect(fromBase64(forAlice)).toHaveLength(512)

    const sealed = await encryptChunk(key, new TextEncoder().encode('hello'), chunkAad('f', 'v', 0))
    const aliceKey = await unwrapDataKey(alice.privateKey, forAlice)
    const plain = await decryptChunk(aliceKey, sealed.ciphertext, sealed.iv, chunkAad('f', 'v', 0))
    expect(new TextDecoder().decode(plain)).toBe('hello')

    await expect(unwrapDataKey(bob.privateKey, forAlice)).rejects.toBeInstanceOf(DecryptError)
  })

  it('re-wraps the same key for a new member set when a file moves', async () => {
    const alice = await generateKeyPair()
    const carol = await generateKeyPair()
    const { raw, key } = await newDataKey()
    const forAlice = await wrapDataKey(raw, toBase64(await exportPublicKey(alice.publicKey)))
    const sealed = await encryptChunk(key, new TextEncoder().encode('moved'), chunkAad('f', 'v', 0))

    const [forCarol] = await rewrapDataKey(alice.privateKey, forAlice, [
      { userId: 'carol', publicKey: toBase64(await exportPublicKey(carol.publicKey)) },
    ])
    expect(forCarol.userId).toBe('carol')
    const carolKey = await unwrapDataKey(carol.privateKey, forCarol.wrapped)
    const plain = await decryptChunk(carolKey, sealed.ciphertext, sealed.iv, chunkAad('f', 'v', 0))
    expect(new TextDecoder().decode(plain)).toBe('moved')
  })
})

describe('encrypted names', () => {
  it('round-trips a name bound to its file', async () => {
    const { key } = await newDataKey()
    const sealed = await encryptText(key, 'contract-northgate-2026.pdf', nameAad('f1'))
    expect(await decryptText(key, sealed.enc, sealed.iv, nameAad('f1'))).toBe(
      'contract-northgate-2026.pdf',
    )
    await expect(decryptText(key, sealed.enc, sealed.iv, nameAad('f2'))).rejects.toBeInstanceOf(
      DecryptError,
    )
  })
})
