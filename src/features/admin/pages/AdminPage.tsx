import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function AdminPage() {
  useCrumbs('Administration')
  return <PagePlaceholder screen="48" title="Administration" phase={6} />
}
