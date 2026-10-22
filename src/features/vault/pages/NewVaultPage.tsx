import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function NewVaultPage() {
  useCrumbs({ label: 'Vaults', to: '/vaults' }, 'New vault')
  return <PagePlaceholder screen="35" title="New vault" phase={3} />
}
