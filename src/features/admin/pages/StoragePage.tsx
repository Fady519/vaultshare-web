import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function StoragePage() {
  useCrumbs('Storage')
  return <PagePlaceholder screen="47" title="Storage and usage" phase={6} />
}
