import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function FileDetailPage() {
  useCrumbs({ label: 'Vaults', to: '/vaults' }, 'File')
  return <PagePlaceholder screen="12" title="File detail" phase={3} />
}
