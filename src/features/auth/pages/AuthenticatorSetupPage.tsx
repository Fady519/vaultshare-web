import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function AuthenticatorSetupPage() {
  useDocumentTitle('Set up an authenticator app')
  return (
    <StepCard step="Step 2 of 3">
      <PagePlaceholder screen="05" title="Set up an authenticator app" phase={2} />
    </StepCard>
  )
}
