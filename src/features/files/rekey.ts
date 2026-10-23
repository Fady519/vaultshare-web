import { filesApi, storage } from '@/api/files'
import { sharingApi } from '@/api/sharing'
import { queryClient } from '@/api/queryClient'
import type { ChunkMeta } from '@/api/types'
import {
  CHUNK_SIZE,
  chunkAad,
  decryptText,
  encryptChunk,
  encryptText,
  nameAad,
  newDataKey,
  noteAad,
  toBase64,
  versionDigest,
  wrapDataKey,
} from '@/crypto'
import { decryptChunks } from './download'
import { dataKeyFor, forgetDataKey } from './keys'

/*
  Key rotation after a revoke. Deleting someone's wrapped key stops the app
  from giving them the key again, but it can't make them forget one they
  already unwrapped. Rotating re-encrypts the version under a brand new key,
  so whatever they kept no longer opens what's stored.

  Per version: decrypt with the old key, encrypt again with a fresh one (same
  AAD, same ids), upload next to the old bytes, wrap the new key for whoever
  holds access now, re-seal the note (and the name for the current version),
  then commit, which swaps everything in one go.
*/

export type RekeyTarget = { fileId: string; versionId: string }

export type RekeyProgress = { done: number; total: number; current?: string }

export async function rekeyVersions(
  targets: RekeyTarget[],
  onProgress?: (p: RekeyProgress) => void,
) {
  const byFile = new Map<string, string[]>()
  for (const t of targets) byFile.set(t.fileId, [...(byFile.get(t.fileId) ?? []), t.versionId])

  let done = 0
  for (const [fileId, versionIds] of byFile) {
    const [detail, versions] = await Promise.all([
      filesApi.detail(fileId),
      filesApi.versions(fileId),
    ])
    const file = detail.file
    for (const versionId of versionIds) {
      const version = versions.find((v) => v.id === versionId)
      if (!version) continue
      onProgress?.({ done, total: targets.length, current: `v${version.versionNo}` })
      await rekeyOne(fileId, version, file.currentVersion.id === versionId ? file : null)
      onProgress?.({ done: ++done, total: targets.length })
    }
  }
  queryClient.removeQueries({ queryKey: ['names'] })
  queryClient.removeQueries({ queryKey: ['notes'] })
}

async function rekeyOne(
  fileId: string,
  version: Awaited<ReturnType<typeof filesApi.versions>>[number],
  currentFile: { encName: string; nameIv: string } | null,
) {
  const info = await filesApi.download(fileId, version.id)
  const oldKey = await dataKeyFor(info.wrappedKey)
  const plain = await decryptChunks(fileId, version.id, oldKey, info)

  const init = await sharingApi.rekey(version.id, info.chunkCount)
  const { key, raw } = await newDataKey()
  try {
    const chunks: ChunkMeta[] = []
    const digests: Uint8Array[] = []
    for (let i = 0; i < info.chunkCount; i++) {
      const slice = new Uint8Array(
        await plain.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer(),
      )
      const sealed = await encryptChunk(key, slice, chunkAad(fileId, version.id, i))
      slice.fill(0)
      await storage.put(init.uploadUrls[i].url, sealed.ciphertext)
      chunks.push({
        index: i,
        iv: toBase64(sealed.iv),
        tag: toBase64(sealed.tag),
        digest: toBase64(sealed.digest),
      })
      digests.push(sealed.digest)
    }

    const wrappedKeys = await Promise.all(
      init.recipients.map(async (r) => ({
        userId: r.userId,
        keyVersion: r.keyVersion,
        wrapped: await wrapDataKey(raw, r.publicKey),
      })),
    )

    let note: { enc: string; iv: string } | undefined
    if (version.encNote && version.noteIv) {
      const text = await decryptText(oldKey, version.encNote, version.noteIv, noteAad(version.id))
      note = await encryptText(key, text, noteAad(version.id))
    }
    let name: { enc: string; iv: string } | undefined
    if (currentFile) {
      const text = await decryptText(
        oldKey,
        currentFile.encName,
        currentFile.nameIv,
        nameAad(fileId),
      )
      name = await encryptText(key, text, nameAad(fileId))
    }

    await sharingApi.commitRekey(version.id, init.rekeyId, {
      chunks,
      digest: toBase64(await versionDigest(digests)),
      wrappedKeys,
      encNote: note?.enc,
      noteIv: note?.iv,
      encName: name?.enc,
      nameIv: name?.iv,
    })
  } finally {
    raw.fill(0)
    forgetDataKey(version.id)
  }
}
