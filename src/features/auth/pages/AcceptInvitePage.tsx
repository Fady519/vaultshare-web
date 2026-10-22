import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function AcceptInvitePage() {
  useDocumentTitle('Accept invitation')
  return (
    <StepCard width={780}>
      <PagePlaceholder screen="33" title="Accept invitation" phase={2} />
    </StepCard>
  )
}
