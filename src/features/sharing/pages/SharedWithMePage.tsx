import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function SharedWithMePage() {
  useCrumbs('Shared with me')
  return <PagePlaceholder screen="17" title="Shared with me" phase={5} />
}
