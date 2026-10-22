import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function SessionsPage() {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, 'Sessions')
  return <PagePlaceholder screen="44" title="Sessions and devices" phase={6} />
}
