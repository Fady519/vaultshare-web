import { Button, ErrorState } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function NotFoundPage() {
  useDocumentTitle('Not found')

  return (
    <StepCard width={720}>
      <ErrorState
        code="404"
        title="This address doesn't exist"
        actions={
          <Button to="/vaults" variant="ghost">
            Go to your vaults
          </Button>
        }
      >
        The link may be mistyped or old. Nothing was denied to you: there is simply no page here. If
        someone shared it with you, ask them to send it again.
      </ErrorState>
    </StepCard>
  )
}
