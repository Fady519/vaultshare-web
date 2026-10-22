import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function RecentPage() {
  useCrumbs('Recent')
  return <PagePlaceholder screen="20" title="Recent" phase={4} />
}
