import { filesApi } from '@/api/files'
import { sharingApi } from '@/api/sharing'
import type { FileDto, PendingGrantDto, ShareRole, VersionDto } from '@/api/types'
import {
  encryptText,
  nameAad,
  newLinkKey,
  sealForLink,
  toBase64Url,
  withRawDataKey,
  wrapDataKey,
} from '@/crypto'
import { useSession } from '@/store/session'
import { dataKeyFor, LockedError } from '@/features/files/keys'

/*
  Everything that hands a data key to someone else happens here, in the
  browser: the key is unwrapped with my private key, wrapped again for their
  public key (or sealed under a link key) and zeroed. The server only ever
  receives the wrapped copies.
*/

function privateKey() {
  const key = useSession.getState().privateKey
  if (!key) throw new LockedError()
  return key
}

type Recipient = { userId: string; publicKey: string; keyVersion: number }

async function wrapEveryVersion(versions: VersionDto[], to: Recipient) {
  const pk = privateKey()
  const out: { versionId: string; keyVersion: number; wrapped: string }[] = []
  for (const v of versions) {
    if (!v.wrappedKey)
      throw new Error(`You hold no key for v${v.versionNo}, so you can't pass it on.`)
    const wrapped = await withRawDataKey(pk, v.wrappedKey.wrapped, (raw) =>
      wrapDataKey(raw, to.publicKey),
    )
    out.push({ versionId: v.id, keyVersion: to.keyVersion, wrapped })
  }
  return out
}

export async function shareFile(
  file: FileDto,
  to: Recipient,
  role: ShareRole,
  expiresAt: string | null,
) {
  const versions = await filesApi.versions(file.id)
  const wrappedKeys = await wrapEveryVersion(versions, to)
  return sharingApi.share(file.id, { userId: to.userId, role, expiresAt, wrappedKeys })
}

export type LinkOptions = {
  expiresInDays: number
  maxDownloads: number
  requireSignIn: boolean
  allowDownload: boolean
  passphrase?: string
}

/*
  The link key exists in two places only: this function, and the URL it
  returns (after the #). It's never stored, so the full link can't be shown
  again later — only revoked.
*/
export async function createSecureLink(file: FileDto, name: string, opts: LinkOptions) {
  const version = file.currentVersion
  if (!version.wrappedKey) throw new Error("You hold no key for this file, so you can't link it.")
  const fragment = newLinkKey()
  try {
    const sealed = await withRawDataKey(privateKey(), version.wrappedKey.wrapped, (raw) =>
      sealForLink(raw, version.id, fragment, opts.passphrase || undefined),
    )
    // the name again, sealed with this version's key, so later versions don't break the link
    const dataKey = await dataKeyFor(version.wrappedKey)
    const linkName = await encryptText(dataKey, name, nameAad(file.id))
    const link = await sharingApi.createLink(file.id, {
      versionId: version.id,
      reWrapped: sealed.reWrapped,
      passphraseSalt: sealed.passphraseSalt,
      encName: linkName.enc,
      nameIv: linkName.iv,
      expiresAt: new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString(),
      maxDownloads: opts.maxDownloads,
      requireSignIn: opts.requireSignIn,
      allowDownload: opts.allowDownload,
    })
    return { link, url: `${location.origin}/s/${link.token}#k=${toBase64Url(fragment)}` }
  } finally {
    fragment.fill(0)
  }
}

// an invitee finished their key ceremony: wrap every version in the vault for them
export async function completeGrant(grant: PendingGrantDto, onProgress?: (done: number) => void) {
  const pk = privateKey()
  const wrappedKeys = []
  for (const [i, v] of grant.versions.entries()) {
    const wrapped = await withRawDataKey(pk, v.wrappedKey.wrapped, (raw) =>
      wrapDataKey(raw, grant.recipient.publicKey),
    )
    wrappedKeys.push({
      versionId: v.versionId,
      userId: grant.recipient.userId,
      keyVersion: grant.recipient.keyVersion,
      wrapped,
    })
    onProgress?.(i + 1)
  }
  await sharingApi.completeGrant(grant.invitationId, { wrappedKeys })
}
