import { useQuery } from '@tanstack/react-query'
import { queryClient } from '@/api/queryClient'
import type { FileDto, VersionDto, WrappedKeyDto } from '@/api/types'
import { decryptText, nameAad, noteAad, unwrapDataKey } from '@/crypto'
import { useSession } from '@/store/session'

/*
  Unwrapped data keys, cached while the vault is unlocked. The cache key is the
  wrapped blob itself, not just the version: after a key rotation the same
  version has a new key, and a stale entry would quietly fail to decrypt.
  They're non-extractable CryptoKeys and the whole cache is dropped on lock,
  together with every decrypted name and plaintext held by react-query.
*/

const keys = new Map<string, Promise<CryptoKey>>()

export class LockedError extends Error {
  constructor() {
    super('The vault is locked. Unlock it to read files.')
    this.name = 'LockedError'
  }
}

export function dataKeyFor(wrapped: WrappedKeyDto) {
  const privateKey = useSession.getState().privateKey
  if (!privateKey) return Promise.reject(new LockedError())

  const id = `${wrapped.versionId}:${wrapped.wrapped}`
  let key = keys.get(id)
  if (!key) {
    key = unwrapDataKey(privateKey, wrapped.wrapped)
    keys.set(id, key)
    key.catch(() => keys.delete(id))
  }
  return key
}

// after a key rotation: drop the old key of that version and anything decrypted with it
export function forgetDataKey(versionId: string) {
  for (const id of keys.keys()) if (id.startsWith(`${versionId}:`)) keys.delete(id)
  queryClient.removeQueries({ queryKey: ['plaintext', versionId] })
}

useSession.subscribe((state, prev) => {
  if (prev.privateKey && !state.privateKey) {
    keys.clear()
    queryClient.removeQueries({ queryKey: ['names'] })
    queryClient.removeQueries({ queryKey: ['plaintext'] })
    queryClient.removeQueries({ queryKey: ['notes'] })
  }
})

export async function decryptFileName(file: FileDto) {
  const wrapped = file.currentVersion.wrappedKey
  if (!wrapped) return null
  const key = await dataKeyFor(wrapped)
  return decryptText(key, file.encName, file.nameIv, nameAad(file.id))
}

// names of a list of files, decrypted in parallel; keyed by version so a new version re-decrypts
export function useFileNames(files: FileDto[] | undefined) {
  const unlocked = useSession((s) => s.privateKey !== null)
  return useQuery({
    queryKey: ['names', ...(files ?? []).map((f) => `${f.id}:${f.currentVersion.id}:${f.nameIv}`)],
    queryFn: async () => {
      const entries = await Promise.all(
        (files ?? []).map(async (f) => {
          try {
            return [f.id, (await decryptFileName(f)) ?? 'Sealed · no key yet'] as const
          } catch {
            return [f.id, 'Could not decrypt name'] as const
          }
        }),
      )
      return Object.fromEntries(entries) as Record<string, string>
    },
    enabled: Boolean(files) && unlocked,
    staleTime: Infinity,
  })
}

export function useFileName(file: FileDto | undefined) {
  const names = useFileNames(file ? [file] : undefined)
  return file ? names.data?.[file.id] : undefined
}

// version notes are sealed with each version's own key
export function useVersionNotes(versions: VersionDto[] | undefined) {
  const unlocked = useSession((s) => s.privateKey !== null)
  return useQuery({
    queryKey: ['notes', ...(versions ?? []).map((v) => v.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        (versions ?? []).map(async (v) => {
          if (!v.encNote || !v.noteIv || !v.wrappedKey) return [v.id, ''] as const
          try {
            const key = await dataKeyFor(v.wrappedKey)
            return [v.id, await decryptText(key, v.encNote, v.noteIv, noteAad(v.id))] as const
          } catch {
            return [v.id, ''] as const
          }
        }),
      )
      return Object.fromEntries(entries) as Record<string, string>
    },
    enabled: Boolean(versions) && unlocked,
    staleTime: Infinity,
  })
}
