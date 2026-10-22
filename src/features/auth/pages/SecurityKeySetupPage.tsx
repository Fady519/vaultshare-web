import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function SecurityKeySetupPage() {
  useDocumentTitle('Register a security key')
  return (
    <StepCard step="Step 2 of 3">
      <PagePlaceholder screen="06" title="Register a security key" phase={2} />
    </StepCard>
  )
}
