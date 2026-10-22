import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function VersionHistoryPage() {
  useCrumbs({ label: 'Vaults', to: '/vaults' }, 'Version history')
  return <PagePlaceholder screen="16" title="Version history" phase={3} />
}
