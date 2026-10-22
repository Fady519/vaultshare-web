import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function AuditLogPage() {
  useCrumbs('Audit log')
  return <PagePlaceholder screen="27" title="Audit log" phase={6} />
}
