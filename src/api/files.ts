import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  BulkAction,
  BulkResponse,
  CommitRequest,
  DownloadResponse,
  FileDetailDto,
  FileDto,
  UploadInitRequest,
  RecentEntry,
  UploadInitResponse,
  VersionDto,
} from './types'

export const fileKeys = {
  all: ['files'] as const,
  vault: (vaultId: string) => ['files', 'vault', vaultId] as const,
  one: (fileId: string) => ['files', fileId] as const,
  versions: (fileId: string) => ['files', fileId, 'versions'] as const,
  favorites: ['files', 'favorites'] as const,
  recent: ['files', 'recent'] as const,
  trash: ['files', 'trash'] as const,
  index: ['files', 'index'] as const,
}

export type MoveRequest = {
  targetVaultId: string
  wrappedKeys: { versionId: string; userId: string; keyVersion: number; wrapped: string }[]
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
  rename: (fileId: string, body: { encName: string; nameIv: string }) =>
    api.patch<FileDto>(`/files/${fileId}`, body),
  move: (fileId: string, body: MoveRequest) => api.post<FileDto>(`/files/${fileId}/move`, body),
  trash: (fileId: string) => api.del<void>(`/files/${fileId}`),
  restore: (fileId: string) => api.post<FileDto>(`/files/${fileId}/restore`),
  purge: (fileId: string) => api.del<void>(`/files/${fileId}/purge`),
  favorite: (fileId: string, on: boolean) =>
    on ? api.put<void>(`/files/${fileId}/favorite`) : api.del<void>(`/files/${fileId}/favorite`),
  bulk: (action: BulkAction, fileIds: string[]) =>
    api.post<BulkResponse>('/files/bulk', { action, fileIds }),
  favorites: () => api.get<FileDto[]>('/files/favorites'),
  recent: (days = 30) => api.get<RecentEntry[]>(`/files/recent?days=${days}`),
  clearRecent: () => api.del<void>('/files/recent'),
  trashList: () => api.get<FileDto[]>('/files/trash'),
  // every file I can read, so search can run here; the search words are never sent
  index: () => api.get<FileDto[]>('/files/index'),
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

export function useFavorites() {
  return useQuery({ queryKey: fileKeys.favorites, queryFn: filesApi.favorites })
}

export function useRecent(days = 30) {
  return useQuery({ queryKey: [...fileKeys.recent, days], queryFn: () => filesApi.recent(days) })
}

export function useTrash() {
  return useQuery({ queryKey: fileKeys.trash, queryFn: filesApi.trashList })
}

export function useFileIndex() {
  return useQuery({ queryKey: fileKeys.index, queryFn: filesApi.index })
}
