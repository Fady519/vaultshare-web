import { Navigate } from 'react-router-dom'
import { Button, EmptyState, SkeletonRows } from '@/components'
import { useVaults } from '@/api/vaults'
import { useCrumbs } from '@/hooks/useCrumbs'

// /vaults just opens the first vault, or explains what a vault is if there are none
export default function VaultsIndexPage() {
  useCrumbs('Vaults')
  const vaults = useVaults()

  if (vaults.isPending) return <SkeletonRows rows={4} />

  const first = vaults.data?.[0]
  if (first) return <Navigate to={`/vaults/${first.id}`} replace />

  return (
    <EmptyState
      icon="folder"
      title="No vaults yet"
      actions={
        <Button to="/vaults/new" icon="plus">
          Create a vault
        </Button>
      }
    >
      A vault is a key ring, not a folder. Everyone you add to it gets their own wrapped copy of
      every file key, so they can open what you upload and nobody else can — not even us.
    </EmptyState>
  )
}
