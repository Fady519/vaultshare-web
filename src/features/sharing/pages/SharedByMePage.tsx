import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function SharedByMePage() {
  useCrumbs('Shared by me')
  return <PagePlaceholder screen="18" title="Shared by me" phase={5} />
}
