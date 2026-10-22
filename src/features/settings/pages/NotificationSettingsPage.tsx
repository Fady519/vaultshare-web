import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function NotificationSettingsPage() {
  useCrumbs({ label: 'Settings', to: '/settings/profile' }, 'Notifications')
  return <PagePlaceholder screen="46" title="Notification preferences" phase={6} />
}
