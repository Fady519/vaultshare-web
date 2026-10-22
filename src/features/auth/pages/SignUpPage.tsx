import { PagePlaceholder } from '@/components'
import { AuthSplit } from '@/layouts/AuthSplit/AuthSplit'
import { useDocumentTitle } from '@/hooks/useCrumbs'

export default function SignUpPage() {
  useDocumentTitle('Sign up')
  return (
    <AuthSplit>
      <PagePlaceholder screen="02" title="Create your vault" phase={2} />
    </AuthSplit>
  )
}
