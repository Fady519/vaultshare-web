import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function VerifyEmailPage() {
  useDocumentTitle('Verify your email')
  return (
    <StepCard width={720}>
      <PagePlaceholder screen="32" title="Verify your email" phase={2} />
    </StepCard>
  )
}
