import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function TwoFactorPage() {
  useDocumentTitle('Two-factor check')
  return (
    <StepCard width={700}>
      <PagePlaceholder screen="09" title="Two-factor check" phase={2} />
    </StepCard>
  )
}
