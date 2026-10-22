import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function KeyCeremonyPage() {
  useDocumentTitle('Key ceremony')
  return (
    <StepCard step="Step 1 of 3">
      <PagePlaceholder screen="03" title="Key ceremony" phase={2} />
    </StepCard>
  )
}
