import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function MembersPage() {
  useCrumbs({ label: 'Vaults', to: '/vaults' }, 'Members')
  return <PagePlaceholder screen="23" title="Members and roles" phase={5} />
}
