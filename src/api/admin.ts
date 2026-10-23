import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  AdminOverviewDto,
  AdminUserDto,
  AuditEntryDto,
  AuditExportDto,
  AuditQuery,
  InvitationDto,
  Paged,
  StorageUsageDto,
  SystemRole,
  TeamMemberDto,
  UserStatus,
} from './types'

export const adminKeys = {
  team: ['team'] as const,
  storage: ['storage'] as const,
  overview: ['admin', 'overview'] as const,
  users: (search: string) => ['admin', 'users', search] as const,
  audit: (q: AuditQuery) => ['audit', q] as const,
}

function query(q: Record<string, string | number | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const adminApi = {
  team: () => api.get<TeamMemberDto[]>('/team/members'),
  teamInvitations: () => api.get<InvitationDto[]>('/team/invitations'),
  storage: () => api.get<StorageUsageDto>('/storage/usage'),
  setRetention: (days: number) => api.put<void>('/storage/retention', { days }),
  overview: () => api.get<AdminOverviewDto>('/admin/overview'),
  users: (search = '', page = 1) =>
    api.get<Paged<AdminUserDto>>(`/admin/users${query({ search, page, pageSize: 100 })}`),
  updateUser: (id: string, body: { status?: UserStatus; systemRole?: SystemRole }) =>
    api.patch<void>(`/admin/users/${id}`, body),
  audit: (q: AuditQuery) => api.get<Paged<AuditEntryDto>>(`/audit${query(q)}`),
  exportAudit: (from?: string, to?: string) =>
    api.post<AuditExportDto>('/audit/export', { from, to }),
}

export function useTeam() {
  return useQuery({ queryKey: adminKeys.team, queryFn: adminApi.team })
}

export function useStorage() {
  return useQuery({ queryKey: adminKeys.storage, queryFn: adminApi.storage })
}

export function useAdminOverview(enabled = true) {
  return useQuery({ queryKey: adminKeys.overview, queryFn: adminApi.overview, enabled })
}

export function useAdminUsers(search: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.users(search),
    queryFn: () => adminApi.users(search),
    enabled,
  })
}

export function useAudit(q: AuditQuery, enabled = true) {
  return useQuery({ queryKey: adminKeys.audit(q), queryFn: () => adminApi.audit(q), enabled })
}
