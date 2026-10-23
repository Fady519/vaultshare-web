import type { FileDetailDto } from '@/api/types'
import type { Crumb } from '@/store/ui'

/*
  What the caller may do with one file, from GET /files/{id}: their vault role,
  or the role of a direct share. Someone with a share works on the file only —
  renaming, moving, trashing and re-sharing stay with the vault's people.
*/
export function fileAccess(detail: FileDetailDto | undefined) {
  const role = detail?.myRole
  const viaShare = detail?.via === 'share'
  const canWrite = role === 'owner' || role === 'manager' || role === 'editor'
  const canManage = !viaShare && (role === 'owner' || role === 'manager')
  const crumb: Crumb | '…' = !detail
    ? '…'
    : viaShare
      ? { label: 'Shared with me', to: '/shared/with-me' }
      : { label: detail.file.vaultName, to: `/vaults/${detail.file.vaultId}` }
  return { viaShare, canWrite, canOrganize: canWrite && !viaShare, canShare: canManage, crumb }
}
