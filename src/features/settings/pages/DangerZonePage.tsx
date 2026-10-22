import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function DangerZonePage() {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, 'Danger zone')
  return <PagePlaceholder screen="49" title="Danger zone" phase={6} />
}
