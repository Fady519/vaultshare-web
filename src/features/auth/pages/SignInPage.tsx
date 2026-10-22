import { PagePlaceholder } from '@/components'
import { AuthSplit } from '@/layouts/AuthSplit/AuthSplit'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function SignInPage() {
  useDocumentTitle('Sign in')
  return (
    <AuthSplit>
      <PagePlaceholder screen="08" title="Unlock your vault" phase={2} />
    </AuthSplit>
  )
}
