import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function NotificationsPage() {
  useCrumbs('Notifications')
  return <PagePlaceholder screen="43" title="Notifications" phase={6} />
}
