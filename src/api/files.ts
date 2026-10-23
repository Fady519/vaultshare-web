import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  CommitRequest,
  DownloadResponse,
  FileDetailDto,
  FileDto,
  UploadInitRequest,
  UploadInitResponse,
  VersionDto,
} from './types'

export const fileKeys = {
  vault: (vaultId: string) => ['files', 'vault', vaultId] as const,
  one: (fileId: string) => ['files', fileId] as const,
  versions: (fileId: string) => ['files', fileId, 'versions'] as const,
}

export const filesApi = {
  list: (vaultId: string, state: 'active' | 'trashed' = 'active') =>
    api.get<{ items: FileDto[]; total: number }>(`/vaults/${vaultId}/files?state=${state}`),
  detail: (fileId: string) => api.get<FileDetailDto>(`/files/${fileId}`),
  versions: (fileId: string) => api.get<VersionDto[]>(`/files/${fileId}/versions`),
  initUpload: (vaultId: string, body: UploadInitRequest) =>
    api.post<UploadInitResponse>(`/vaults/${vaultId}/uploads`, body),
  commit: (versionId: string, body: CommitRequest) =>
    api.post<FileDto>(`/uploads/${versionId}/commit`, body),
  abort: (versionId: string) => api.del<void>(`/uploads/${versionId}`),
  download: (fileId: string, versionId: string) =>
    api.get<DownloadResponse>(`/files/${fileId}/versions/${versionId}/download`),
}

/*
  Presigned object-storage URLs. They go straight to the bucket, not the API,
  so no auth header and no cookies — the URL itself is the permission.
*/
export const storage = {
  async put(url: string, bytes: Uint8Array, signal?: AbortSignal) {
    const res = await fetch(url, {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' },
      credentials: 'omit',
      signal,
    })
    if (!res.ok) throw new Error(`Storage answered ${res.status}`)
  },
  async get(url: string, signal?: AbortSignal) {
    const res = await fetch(url, { credentials: 'omit', signal })
    if (!res.ok) throw new Error(`Storage answered ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  },
}

export function useVaultFiles(vaultId: string | undefined) {
  return useQuery({
    queryKey: fileKeys.vault(vaultId ?? ''),
    queryFn: () => filesApi.list(vaultId!),
    enabled: Boolean(vaultId),
  })
}

export function useFileDetail(fileId: string | undefined) {
  return useQuery({
    queryKey: fileKeys.one(fileId ?? ''),
    queryFn: () => filesApi.detail(fileId!),
    enabled: Boolean(fileId),
  })
}

export function useFileVersions(fileId: string | undefined) {
  return useQuery({
    queryKey: fileKeys.versions(fileId ?? ''),
    queryFn: () => filesApi.versions(fileId!),
    enabled: Boolean(fileId),
  })
}
