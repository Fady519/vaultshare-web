import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  AffectedVersions,
  CompleteGrantRequest,
  CreateLinkRequest,
  CreateShareRequest,
  FileShareDto,
  IncomingShare,
  InvitationDto,
  InviteRequest,
  LinkDto,
  MemberDto,
  OutgoingShare,
  PendingGrantDto,
  PublicLinkDownload,
  PublicLinkDto,
  RekeyCommitRequest,
  RekeyInitResponse,
  ShareDto,
  ShareRole,
  VaultRole,
} from './types'

export const shareKeys = {
  file: (fileId: string) => ['shares', 'file', fileId] as const,
  incoming: ['shares', 'incoming'] as const,
  outgoing: ['shares', 'outgoing'] as const,
  links: ['links'] as const,
  invitations: (vaultId: string) => ['invitations', vaultId] as const,
  grants: ['grants'] as const,
}

export const sharingApi = {
  fileShares: (fileId: string) => api.get<FileShareDto[]>(`/files/${fileId}/shares`),
  share: (fileId: string, body: CreateShareRequest) =>
    api.post<ShareDto>(`/files/${fileId}/shares`, body),
  changeShare: (fileId: string, userId: string, role: ShareRole) =>
    api.patch<ShareDto>(`/files/${fileId}/shares/${userId}`, { role }),
  revokeShare: (fileId: string, userId: string) =>
    api.del<AffectedVersions>(`/files/${fileId}/shares/${userId}`),
  incoming: () => api.get<IncomingShare[]>('/shares/incoming'),
  outgoing: () => api.get<OutgoingShare[]>('/shares/outgoing'),

  createLink: (fileId: string, body: CreateLinkRequest) =>
    api.post<LinkDto>(`/files/${fileId}/links`, body),
  links: () => api.get<LinkDto[]>('/links'),
  revokeLink: (linkId: string) => api.del<void>(`/links/${linkId}`),
  // no session needed unless the link asks for one
  publicLink: (token: string) => api.get<PublicLinkDto>(`/public/links/${token}`),
  publicDownload: (token: string) =>
    api.post<PublicLinkDownload>(`/public/links/${token}/download`),

  changeRole: (vaultId: string, userId: string, role: VaultRole) =>
    api.patch<MemberDto>(`/vaults/${vaultId}/members/${userId}`, { role }),
  removeMember: (vaultId: string, userId: string) =>
    api.del<AffectedVersions>(`/vaults/${vaultId}/members/${userId}`),
  invite: (vaultId: string, body: InviteRequest) =>
    api.post<InvitationDto>(`/vaults/${vaultId}/invitations`, body),
  invitations: (vaultId: string) => api.get<InvitationDto[]>(`/vaults/${vaultId}/invitations`),
  cancelInvitation: (id: string) => api.del<void>(`/invitations/${id}`),
  pendingGrants: () => api.get<PendingGrantDto[]>('/grants/pending'),
  completeGrant: (invitationId: string, body: CompleteGrantRequest) =>
    api.post<void>(`/grants/${invitationId}/complete`, body),

  rekey: (versionId: string, chunkCount: number) =>
    api.post<RekeyInitResponse>(`/versions/${versionId}/rekey`, { chunkCount }),
  commitRekey: (versionId: string, rekeyId: string, body: RekeyCommitRequest) =>
    api.post<void>(`/versions/${versionId}/rekey/${rekeyId}/commit`, body),
}

export function useFileShares(fileId: string | undefined) {
  return useQuery({
    queryKey: shareKeys.file(fileId ?? ''),
    queryFn: () => sharingApi.fileShares(fileId!),
    enabled: Boolean(fileId),
  })
}

export function useIncomingShares() {
  return useQuery({ queryKey: shareKeys.incoming, queryFn: sharingApi.incoming })
}

export function useOutgoingShares() {
  return useQuery({ queryKey: shareKeys.outgoing, queryFn: sharingApi.outgoing })
}

export function useMyLinks() {
  return useQuery({ queryKey: shareKeys.links, queryFn: sharingApi.links })
}

export function useInvitations(vaultId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: shareKeys.invitations(vaultId ?? ''),
    queryFn: () => sharingApi.invitations(vaultId!),
    enabled: Boolean(vaultId) && enabled,
  })
}

export function usePendingGrants(enabled = true) {
  return useQuery({ queryKey: shareKeys.grants, queryFn: sharingApi.pendingGrants, enabled })
}
