import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function SearchPage() {
  useCrumbs('Search')
  return <PagePlaceholder screen="21" title="Search" phase={4} />
}
