import { useQueryClient } from '@tanstack/react-query'
import { Icon, PageHead, ProgressBar, SectionMark, Select, SkeletonRows, toast } from '@/components'
import { adminApi, adminKeys, useStorage } from '@/api/admin'
import { errorMessage } from '@/api/client'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useSession } from '@/store/session'
import { formatBytes, formatNumber } from '@/utils/format'
import s from '@/features/settings/settings.module.css'
import styles from './StoragePage.module.css'

const RETENTION = [7, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} days` }))

// figma 47. every figure is ciphertext: the server can only measure what it stores
export default function StoragePage() {
  useCrumbs('Storage')
  const qc = useQueryClient()
  const me = useSession((st) => st.user)
  const usage = useStorage()
  const u = usage.data
  const biggest = Math.max(1, ...(u?.byVault.map((v) => v.sizeBytes) ?? [1]))

  async function setRetention(days: number) {
    try {
      await adminApi.setRetention(days)
      toast(`Trashed files are now kept ${days} days.`, 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: adminKeys.storage })
    }
  }

  return (
    <>
      <PageHead
        title="Storage and usage"
        meta={
          u
            ? `${formatBytes(u.quotaBytes)} per person  ·  trash kept ${u.retentionDays} days  ·  all figures are ciphertext`
            : ' '
        }
      />

      {usage.isPending && <SkeletonRows rows={5} />}

      {u && (
        <>
          <section className={styles.total}>
            <p className={styles.big}>
              {formatBytes(u.usedBytes)} <span>of {formatBytes(u.quotaBytes)} used</span>
            </p>
            <ProgressBar
              value={u.usedBytes / u.quotaBytes}
              label="Storage used"
              tone={u.usedBytes / u.quotaBytes > 0.9 ? 'danger' : 'accent'}
            />
            <p className={s.note}>
              {formatBytes(u.trashBytes)} of it is in the trash · encryption adds{' '}
              {formatNumber(u.overheadBytes)} bytes (a 12-byte IV and a 16-byte tag per 4 MiB chunk,
              about {u.usedBytes ? ((u.overheadBytes / u.usedBytes) * 100).toFixed(2) : '0'}%)
            </p>
          </section>

          <section className={s.section}>
            <SectionMark num="01">Per vault</SectionMark>
            <div role="table" aria-label="Storage per vault">
              <div role="row" className={`${styles.row} ${styles.head}`}>
                <span role="columnheader">Vault</span>
                <span role="columnheader">Ciphertext</span>
                <span role="columnheader">Files</span>
                <span role="columnheader">Versions</span>
                <span role="columnheader">Members</span>
              </div>
              {u.byVault.map((v) => (
                <div key={v.vaultId} role="row" className={styles.row}>
                  <span role="cell" className={styles.vault}>
                    <Icon name="folder" />
                    {v.name}
                  </span>
                  <span role="cell" className={styles.barCell}>
                    <span className={styles.track} aria-hidden>
                      <span
                        className={styles.fill}
                        style={{ width: `${(v.sizeBytes / biggest) * 100}%` }}
                      />
                    </span>
                    <span className={styles.mono}>{formatBytes(v.sizeBytes)}</span>
                  </span>
                  <span role="cell" className={styles.mono}>
                    {v.fileCount}
                  </span>
                  <span role="cell" className={styles.mono}>
                    {v.versionCount}
                  </span>
                  <span role="cell" className={styles.mono}>
                    {v.memberCount}
                  </span>
                </div>
              ))}
            </div>
            <p className={s.note}>
              Each version is stored on its own, so old versions count until they are purged.
            </p>
          </section>

          <section className={s.section}>
            <SectionMark num="02">Policy</SectionMark>
            <div className={s.row}>
              <div className={s.rowText}>
                <p className={s.rowTitle}>Keep trashed files for</p>
                <p className={s.rowSub}>
                  after that the nightly job destroys the keys, then the bytes
                  {me?.systemRole === 'admin' ? '' : ' · only an administrator can change this'}
                </p>
              </div>
              <Select
                compact
                aria-label="Trash retention"
                options={RETENTION}
                value={String(u.retentionDays)}
                disabled={me?.systemRole !== 'admin'}
                onChange={(e) => setRetention(Number(e.target.value))}
              />
            </div>
            <div className={s.row}>
              <div className={s.rowText}>
                <p className={s.rowTitle}>Plan</p>
                <p className={s.rowSub}>
                  Self-hosted for this project: no billing, the quota is a number the administrator
                  sets. Zero-knowledge is not a paid tier — every account gets the same
                  cryptography.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}
