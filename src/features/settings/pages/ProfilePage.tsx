import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function ProfilePage() {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, 'Profile')
  return <PagePlaceholder screen="26" title="Profile" phase={6} />
}
