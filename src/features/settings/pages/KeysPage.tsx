import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function KeysPage() {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, 'Encryption keys')
  return <PagePlaceholder screen="45" title="Encryption keys" phase={6} />
}
