import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function OpenLinkPage() {
  useDocumentTitle('Shared file')
  return (
    <StepCard width={720}>
      <PagePlaceholder screen="—" title="Shared file" phase={5} />
    </StepCard>
  )
}
