import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function ResetPasswordPage() {
  useDocumentTitle('Set a new password')
  return (
    <StepCard width={760}>
      <PagePlaceholder screen="31" title="Set a new password" phase={2} />
    </StepCard>
  )
}
