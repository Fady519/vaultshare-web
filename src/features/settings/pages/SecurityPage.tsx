import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function SecurityPage() {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, 'Security')
  return <PagePlaceholder screen="25" title="Security" phase={6} />
}
