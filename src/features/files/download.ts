import { filesApi, storage } from '@/api/files'
import type { DownloadResponse } from '@/api/types'
import {
  chunkAad,
  DecryptError,
  fromBase64,
  IntegrityError,
  sha256,
  toBase64,
  decryptChunk,
} from '@/crypto'
import { dataKeyFor } from './keys'

/*
  UC: download and decrypt (FR-11). Each chunk is checked twice — its SHA-256
  against the digest from commit time, then the GCM tag — and one failure
  stops everything. The partial plaintext is thrown away, never saved.
*/

export type DownloadStage = 'fetch' | 'unwrap' | 'chunks' | 'done'

export type DownloadProgress = { stage: DownloadStage; chunk: number; chunkCount: number }

export type Decrypted = { blob: Blob; info: DownloadResponse }

export async function decryptVersion(
  fileId: string,
  versionId: string,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Decrypted> {
  onProgress?.({ stage: 'fetch', chunk: 0, chunkCount: 0 })
  const info = await filesApi.download(fileId, versionId)
  signal?.throwIfAborted()

  onProgress?.({ stage: 'unwrap', chunk: 0, chunkCount: info.chunkCount })
  const key = await dataKeyFor(info.wrappedKey)
  signal?.throwIfAborted()

  const parts: Uint8Array[] = []
  try {
    for (const c of info.chunks) {
      const ciphertext = await storage.get(c.url, signal)
      if (toBase64(await sha256(ciphertext)) !== c.digest) {
        throw new IntegrityError(c.index, 'the stored bytes do not match their digest')
      }
      try {
        parts.push(
          await decryptChunk(
            key,
            ciphertext,
            fromBase64(c.iv),
            chunkAad(fileId, versionId, c.index),
          ),
        )
      } catch (err) {
        if (err instanceof DecryptError)
          throw new IntegrityError(c.index, 'the authentication tag was rejected')
        throw err
      }
      onProgress?.({ stage: 'chunks', chunk: c.index + 1, chunkCount: info.chunkCount })
    }
  } catch (err) {
    parts.forEach((p) => p.fill(0))
    throw err
  }

  onProgress?.({ stage: 'done', chunk: info.chunkCount, chunkCount: info.chunkCount })
  return { blob: new Blob(parts, { type: info.mimeType }), info }
}

// hand the decrypted file to the browser's download, then forget the URL
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
