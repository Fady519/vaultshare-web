import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function TeamPage() {
  useCrumbs('Team')
  return <PagePlaceholder screen="24" title="Team" phase={6} />
}
