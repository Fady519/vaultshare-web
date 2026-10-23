import { useQuery } from '@tanstack/react-query'
import type { VersionDto } from '@/api/types'
import { fromBase64, toHex } from '@/crypto'
import { formatBytes, shortHash } from '@/utils/format'
import { decryptVersion } from './download'

// the commit-time digest is over ciphertext, so it's fine to show it anywhere
export const digestHex = (b64: string) => toHex(fromBase64(b64))

// "sha256 a1f7…8c · 4.2 MB", the second line of a file row
export function cipherMeta(v: Pick<VersionDto, 'digest' | 'sizeBytes'>) {
  return `sha256 ${shortHash(digestHex(v.digest))} · ${formatBytes(v.sizeBytes)}`
}

/*
  Decrypted bytes of one version, for previews. They live in react-query's
  memory only: dropped a minute after the page stops using them, and all at
  once when the vault locks (see keys.ts). Nothing goes to disk or storage.
*/
export function usePlaintext(fileId: string | undefined, versionId: string | undefined) {
  return useQuery({
    queryKey: ['plaintext', versionId],
    queryFn: ({ signal }) => decryptVersion(fileId!, versionId!, undefined, signal),
    enabled: Boolean(fileId && versionId),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  })
}

const TEXT_TYPES = ['application/json', 'text/markdown', 'text/csv', 'image/svg+xml']

export function isTextLike(mimeType: string) {
  return mimeType.startsWith('text/') || TEXT_TYPES.includes(mimeType)
}

export function canPreview(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' || isTextLike(mimeType)
}
