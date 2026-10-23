import { describe, expect, it } from 'vitest'
import { DecryptError } from './errors'
import { chunkAad, decryptChunk, encryptChunk, newDataKey } from './files'
import { newLinkKey, openFromLink, sealForLink } from './links'

const hello = new TextEncoder().encode('hello link')

async function sample() {
  const { raw, key } = await newDataKey()
  const sealed = await encryptChunk(key, hello, chunkAad('f', 'v1', 0))
  return { raw, sealed }
}

describe('secure links', () => {
  it('opens the data key with the fragment key alone', async () => {
    const { raw, sealed } = await sample()
    const fragment = newLinkKey()
    const { reWrapped, passphraseSalt } = await sealForLink(raw, 'v1', fragment)
    expect(passphraseSalt).toBeNull()

    const key = await openFromLink(reWrapped, 'v1', fragment)
    const plain = await decryptChunk(key, sealed.ciphertext, sealed.iv, chunkAad('f', 'v1', 0))
    expect(new TextDecoder().decode(plain)).toBe('hello link')
  })

  it('rejects another fragment key, and a sealed key moved to another version', async () => {
    const { raw } = await sample()
    const fragment = newLinkKey()
    const { reWrapped } = await sealForLink(raw, 'v1', fragment)
    await expect(openFromLink(reWrapped, 'v1', newLinkKey())).rejects.toBeInstanceOf(DecryptError)
    await expect(openFromLink(reWrapped, 'v2', fragment)).rejects.toBeInstanceOf(DecryptError)
  })

  it('needs the passphrase too when one was set', async () => {
    const { raw, sealed } = await sample()
    const fragment = newLinkKey()
    const { reWrapped, passphraseSalt } = await sealForLink(raw, 'v1', fragment, 'blue harbour')
    expect(passphraseSalt).not.toBeNull()

    await expect(
      openFromLink(reWrapped, 'v1', fragment, 'wrong words', passphraseSalt),
    ).rejects.toBeInstanceOf(DecryptError)
    const key = await openFromLink(reWrapped, 'v1', fragment, 'blue harbour', passphraseSalt)
    const plain = await decryptChunk(key, sealed.ciphertext, sealed.iv, chunkAad('f', 'v1', 0))
    expect(new TextDecoder().decode(plain)).toBe('hello link')
  }, 30_000)
})
