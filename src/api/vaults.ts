import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { CreateVaultRequest, MemberDto, VaultDto } from './types'

export const vaultKeys = {
  all: ['vaults'] as const,
  one: (id: string) => ['vaults', id] as const,
  members: (id: string) => ['vaults', id, 'members'] as const,
}

export function useVaults() {
  return useQuery({
    queryKey: vaultKeys.all,
    queryFn: () => api.get<VaultDto[]>('/vaults'),
  })
}

export function useVault(vaultId: string | undefined) {
  return useQuery({
    queryKey: vaultKeys.one(vaultId ?? ''),
    queryFn: () => api.get<VaultDto>(`/vaults/${vaultId}`),
    enabled: Boolean(vaultId),
  })
}

export function useVaultMembers(vaultId: string | undefined) {
  return useQuery({
    queryKey: vaultKeys.members(vaultId ?? ''),
    queryFn: () => api.get<MemberDto[]>(`/vaults/${vaultId}/members`),
    enabled: Boolean(vaultId),
  })
}

export function useCreateVault() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateVaultRequest) => api.post<VaultDto>('/vaults', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaultKeys.all }),
  })
}
