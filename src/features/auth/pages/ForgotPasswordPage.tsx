import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function ForgotPasswordPage() {
  useDocumentTitle('Get back into your account')
  return (
    <StepCard>
      <PagePlaceholder screen="10" title="Get back into your account" phase={2} />
    </StepCard>
  )
}
