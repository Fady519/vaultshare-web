import { filesApi, storage } from '@/api/files'
import { api } from '@/api/client'
import type { ChunkMeta, FileDto, MemberDto, NewWrappedKey } from '@/api/types'
import {
  CHUNK_SIZE,
  chunkAad,
  chunkCountFor,
  encryptChunk,
  encryptText,
  nameAad,
  newDataKey,
  noteAad,
  toBase64,
  toHex,
  versionDigest,
  wrapDataKey,
} from '@/crypto'

/*
  UC-02 upload and encrypt, step by step:
  1. ask the server for ids + presigned URLs (AAD needs the ids before encrypting)
  2. new random 256-bit data key, just for this version
  3. read the file in 4 MiB slices, seal each one, PUT it straight to storage
  4. wrap the data key for every member's public key
  5. seal the name (and optional note) with the same key, then commit
  Nothing readable and no key ever goes to the API.
*/

export type UploadStage = 'prepare' | 'encrypt' | 'wrap' | 'commit' | 'done'

export type Recipient = { userId: string; displayName: string; fingerprint: string }

export type UploadProgress = {
  stage: UploadStage
  chunk: number
  chunkCount: number
  bytesDone: number
  recipients: Recipient[]
  iv?: string
  tag?: string
  sample?: string
}

type UploadOptions = {
  vaultId: string
  data: Blob
  name: string
  mimeType: string
  // set when this is a new version of an existing file
  fileId?: string | null
  note?: string
  signal?: AbortSignal
  onProgress?: (p: UploadProgress) => void
}

async function putWithRetry(url: string, bytes: Uint8Array, index: number, signal?: AbortSignal) {
  // chunks are sealed independently, so a failed one is simply sent again
  for (let attempt = 1; ; attempt++) {
    try {
      return await storage.put(url, bytes, signal)
    } catch (err) {
      if (signal?.aborted || attempt === 3) {
        throw new Error(`Chunk ${index + 1} could not be uploaded: ${(err as Error).message}`)
      }
      await new Promise((r) => setTimeout(r, 400 * attempt))
    }
  }
}

export async function uploadFile(opts: UploadOptions): Promise<FileDto> {
  const { vaultId, data, signal } = opts
  const chunkCount = chunkCountFor(data.size)
  const progress: UploadProgress = {
    stage: 'prepare',
    chunk: 0,
    chunkCount,
    bytesDone: 0,
    recipients: [],
  }
  const report = (patch: Partial<UploadProgress>) => {
    Object.assign(progress, patch)
    opts.onProgress?.({ ...progress })
  }

  const members = await api.get<MemberDto[]>(`/vaults/${vaultId}/members`)
  const recipients = members.filter((m) => m.status === 'active' && m.publicKey)

  const init = await filesApi.initUpload(vaultId, {
    fileId: opts.fileId ?? null,
    mimeType: opts.mimeType || 'application/octet-stream',
    sizeBytes: data.size,
    chunkCount,
  })

  const { key, raw } = await newDataKey()
  try {
    report({ stage: 'encrypt' })
    const chunks: ChunkMeta[] = []
    const digests: Uint8Array[] = []

    for (let i = 0; i < chunkCount; i++) {
      if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
      const plain = new Uint8Array(
        await data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer(),
      )
      const sealed = await encryptChunk(key, plain, chunkAad(init.fileId, init.versionId, i))
      plain.fill(0)
      await putWithRetry(init.uploadUrls[i].url, sealed.ciphertext, i, signal)

      chunks.push({
        index: i,
        iv: toBase64(sealed.iv),
        tag: toBase64(sealed.tag),
        digest: toBase64(sealed.digest),
      })
      digests.push(sealed.digest)
      report({
        chunk: i + 1,
        bytesDone: Math.min(data.size, (i + 1) * CHUNK_SIZE),
        iv: toHex(sealed.iv),
        tag: toHex(sealed.tag),
        sample: i === 0 ? toHex(sealed.ciphertext.slice(0, 36)) : progress.sample,
      })
    }

    report({ stage: 'wrap' })
    const wrappedKeys: NewWrappedKey[] = await Promise.all(
      recipients.map(async (m) => ({
        userId: m.userId,
        keyVersion: m.keyVersion,
        wrapped: await wrapDataKey(raw, m.publicKey),
      })),
    )
    report({
      recipients: recipients.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        fingerprint: m.fingerprint,
      })),
    })

    report({ stage: 'commit' })
    const name = await encryptText(key, opts.name, nameAad(init.fileId))
    const note = opts.note?.trim()
      ? await encryptText(key, opts.note.trim(), noteAad(init.versionId))
      : null
    const file = await filesApi.commit(init.versionId, {
      encName: name.enc,
      nameIv: name.iv,
      encNote: note?.enc,
      noteIv: note?.iv,
      digest: toBase64(await versionDigest(digests)),
      chunks,
      wrappedKeys,
    })
    report({ stage: 'done' })
    return file
  } catch (err) {
    // nothing half-uploaded should stay behind
    filesApi.abort(init.versionId).catch(() => {})
    throw err
  } finally {
    raw.fill(0)
  }
}
