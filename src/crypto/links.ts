import { concatBytes, fromBase64, randomBytes, toBase64, utf8 } from './encoding'
import { importAesKey } from './files'
import { argon2id, hkdfAesKey } from './kdf'
import { open, seal } from './seal'

/*
  Secure links (figma 41). A fresh 256-bit link key goes into the URL after
  the "#", which browsers never send to a server. The file's data key is
  sealed under that link key — optionally mixed with a passphrase through
  Argon2id — so what the server stores for the link is useless on its own.
*/

export const LINK_KEY_BYTES = 32
const INFO = 'vs:link:v1'

export const newLinkKey = () => randomBytes(LINK_KEY_BYTES)

// bound to the version, so a sealed key can't be swapped onto another link
export const linkAad = (versionId: string) => utf8(`${versionId}|link`)

async function linkWrappingKey(fragmentKey: Uint8Array, passphrase?: string, salt?: Uint8Array) {
  if (!passphrase) return hkdfAesKey(fragmentKey, new Uint8Array(0), INFO)
  const stretched = await argon2id(passphrase, salt!)
  try {
    return await hkdfAesKey(concatBytes(fragmentKey, stretched), new Uint8Array(0), INFO)
  } finally {
    stretched.fill(0)
  }
}

export async function sealForLink(
  rawDataKey: Uint8Array,
  versionId: string,
  fragmentKey: Uint8Array,
  passphrase?: string,
) {
  const salt = passphrase ? randomBytes(16) : null
  const key = await linkWrappingKey(fragmentKey, passphrase, salt ?? undefined)
  return {
    reWrapped: toBase64(await seal(key, rawDataKey, linkAad(versionId))),
    passphraseSalt: salt ? toBase64(salt) : null,
  }
}

// throws DecryptError for a wrong passphrase or a damaged link
export async function openFromLink(
  reWrapped: string,
  versionId: string,
  fragmentKey: Uint8Array,
  passphrase?: string,
  passphraseSalt?: string | null,
) {
  const key = await linkWrappingKey(
    fragmentKey,
    passphrase,
    passphraseSalt ? fromBase64(passphraseSalt) : undefined,
  )
  const raw = await open(key, fromBase64(reWrapped), linkAad(versionId))
  try {
    return await importAesKey(raw)
  } finally {
    raw.fill(0)
  }
}
