import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function FilePreviewPage() {
  useCrumbs({ label: 'Vaults', to: '/vaults' }, 'Preview')
  return <PagePlaceholder screen="36" title="Preview" phase={3} />
}
