import { PagePlaceholder } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function RecoveryCodesPage() {
  useDocumentTitle('Save your recovery codes')
  return (
    <StepCard step="Step 3 of 3">
      <PagePlaceholder screen="07" title="Save your recovery codes" phase={2} />
    </StepCard>
  )
}
