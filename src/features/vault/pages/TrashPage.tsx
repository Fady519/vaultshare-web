import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function TrashPage() {
  useCrumbs('Trash')
  return <PagePlaceholder screen="22" title="Trash" phase={4} />
}
