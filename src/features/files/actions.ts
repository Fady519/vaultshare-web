import { queryClient } from '@/api/queryClient'
import { api, errorMessage } from '@/api/client'
import { fileKeys, filesApi, type MoveRequest } from '@/api/files'
import { sharingApi } from '@/api/sharing'
import { vaultKeys } from '@/api/vaults'
import type { FileDto, MemberDto } from '@/api/types'
import { toast } from '@/components'
import { encryptText, nameAad, rewrapDataKey } from '@/crypto'
import { useSession } from '@/store/session'
import { dataKeyFor, LockedError } from './keys'

// every list that shows files (vault, favorites, recent, trash, search) plus the vault counts
export function refreshFiles() {
  queryClient.invalidateQueries({ queryKey: fileKeys.all })
  queryClient.invalidateQueries({ queryKey: vaultKeys.all })
}

// the name is metadata but still ciphertext: sealed again with the current version's key
export async function renameFile(file: FileDto, name: string) {
  const wrapped = file.currentVersion.wrappedKey
  if (!wrapped) throw new Error("You don't hold a key for this file, so you can't rename it.")
  const key = await dataKeyFor(wrapped)
  const sealed = await encryptText(key, name.trim(), nameAad(file.id))
  return filesApi.rename(file.id, { encName: sealed.enc, nameIv: sealed.iv })
}

/*
  Moving = the same ciphertext, new key holders. Every version's data key is
  unwrapped here and wrapped again for the target vault's members; whoever is
  only in the old vault loses their copy.
*/
export async function moveFile(file: FileDto, targetVaultId: string) {
  const privateKey = useSession.getState().privateKey
  if (!privateKey) throw new LockedError()

  const [versions, members, shares] = await Promise.all([
    filesApi.versions(file.id),
    api.get<MemberDto[]>(`/vaults/${targetVaultId}/members`),
    sharingApi.fileShares(file.id),
  ])
  // direct shares travel with the file
  const recipients = [
    ...members.filter((m) => m.status === 'active' && m.publicKey),
    ...shares.filter((sh) => !members.some((m) => m.userId === sh.userId)),
  ]
  const keyVersionOf = new Map(recipients.map((m) => [m.userId, m.keyVersion]))

  const wrappedKeys: MoveRequest['wrappedKeys'] = []
  for (const v of versions) {
    if (!v.wrappedKey) {
      throw new Error(`You hold no key for v${v.versionNo}, so only someone who does can move it.`)
    }
    const rewrapped = await rewrapDataKey(privateKey, v.wrappedKey.wrapped, recipients)
    for (const k of rewrapped) {
      wrappedKeys.push({
        versionId: v.id,
        userId: k.userId,
        keyVersion: keyVersionOf.get(k.userId)!,
        wrapped: k.wrapped,
      })
    }
  }
  return filesApi.move(file.id, { targetVaultId, wrappedKeys })
}

// soft delete with an undo in the toast; one file uses its own endpoint, more go through bulk
export async function trashWithUndo(ids: string[], label: string) {
  try {
    if (ids.length === 1) await filesApi.trash(ids[0])
    else {
      const res = await filesApi.bulk('trash', ids)
      if (res.failed.length) {
        toast(`${res.failed.length} could not be moved to trash (role or state).`, 'warn')
      }
      ids = res.done
    }
  } catch (err) {
    toast(errorMessage(err), 'danger')
    return
  } finally {
    refreshFiles()
  }
  if (ids.length === 0) return
  toast(`${label} moved to trash.`, 'info', {
    label: 'Undo',
    onClick: async () => {
      await filesApi.bulk('restore', ids).catch(() => null)
      refreshFiles()
    },
  })
}

export async function toggleFavorite(file: FileDto) {
  try {
    await filesApi.favorite(file.id, !file.isFavorite)
  } catch (err) {
    toast(errorMessage(err), 'danger')
  }
  refreshFiles()
}
