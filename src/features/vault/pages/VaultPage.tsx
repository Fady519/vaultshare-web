import { useParams } from 'react-router-dom'
import { Button, Callout, PagePlaceholder, Skeleton } from '@/components'
import { useVault } from '@/api/vaults'
import { useCrumbs } from '@/hooks/useCrumbs'
import { formatDate } from '@/utils/format'
import styles from './VaultPage.module.css'

export default function VaultPage() {
  const { vaultId } = useParams()
  const vault = useVault(vaultId)

  useCrumbs({ label: 'Vaults', to: '/vaults' }, vault.data?.name ?? '…')

  if (vault.isError) {
    return (
      <Callout tone="danger" title="This vault could not be opened">
        It may have been deleted, or you are no longer a member.
      </Callout>
    )
  }

  const v = vault.data

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{v ? v.name : <Skeleton width={240} height={28} />}</h1>
          <p className={styles.meta}>
            {v
              ? `${v.fileCount} files  ·  AES-256-GCM  ·  ${v.memberCount} members  ·  created ${formatDate(v.createdAt)}`
              : ' '}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" icon="share" disabled>
            Share
          </Button>
          <Button icon="upload" disabled>
            Upload
          </Button>
        </div>
      </header>

      <PagePlaceholder
        screen="11"
        title="File list"
        phase={3}
        note="Vault data above comes from the API. The encrypted file list is built in"
      />
    </>
  )
}
