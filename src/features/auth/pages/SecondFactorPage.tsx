import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function SecondFactorPage() {
  useDocumentTitle('Choose a second factor')
  return (
    <StepCard step="Step 2 of 3">
      <PagePlaceholder screen="04" title="Choose a second factor" phase={2} />
    </StepCard>
  )
}
