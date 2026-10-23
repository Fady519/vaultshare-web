import { useState, type FormEvent } from 'react'
import { Button, Callout, Modal, TextField, toast } from '@/components'
import { filesApi, useFileDetail } from '@/api/files'
import { errorMessage } from '@/api/client'
import type { FileDto } from '@/api/types'
import { useSession } from '@/store/session'
import { formatBytes } from '@/utils/format'
import { refreshFiles } from '../actions'
import styles from './PurgeDialog.module.css'

type Props =
  | { mode: 'one'; file: FileDto; name: string; onClose: () => void }
  | { mode: 'all'; files: FileDto[]; onClose: () => void }

const EMPTY_PHRASE = 'empty trash'

// figma 39. typing the name is the speed bump: this is the one action with no way back
export function PurgeDialog(props: Props) {
  const me = useSession((s) => s.user)
  const one = props.mode === 'one' ? props : null
  const many = props.mode === 'all' ? props.files : []
  const detail = useFileDetail(one?.file.id)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const phrase = one ? one.name : EMPTY_PHRASE
  const holders = detail.data?.access.filter((a) => a.hasKey) ?? []
  const holderNames = holders
    .map((h) => (h.userId === me?.id ? 'you' : h.displayName.split(' ')[0]))
    .join(', ')

  async function purge(e: FormEvent) {
    e.preventDefault()
    if (typed !== phrase) return
    setBusy(true)
    setError('')
    try {
      if (one) {
        await filesApi.purge(one.file.id)
        toast(`${one.name} is gone for good.`, 'ok')
      } else if (props.mode === 'all') {
        const res = await filesApi.bulk(
          'purge',
          props.files.map((f) => f.id),
        )
        toast(
          res.failed.length
            ? `${res.done.length} deleted. ${res.failed.length} need an owner or manager of their vault.`
            : `${res.done.length} files deleted for good.`,
          res.failed.length ? 'warn' : 'ok',
        )
      }
      refreshFiles()
      props.onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const rows: [string, string, 'danger' | 'ok' | undefined][] = one
    ? [
        ['File', one.name, undefined],
        ['Versions destroyed', detail.data ? String(detail.data.versionCount) : '…', 'danger'],
        [
          'Wrapped key copies',
          detail.data ? `${holders.length} per version (${holderNames || 'nobody'})` : '…',
          'danger',
        ],
        ['Audit entries kept', 'yes, the chain is append-only', 'ok'],
      ]
    : [
        ['Files', String(many.length), undefined],
        [
          'Ciphertext',
          formatBytes(many.reduce((n, f) => n + f.sizeBytes, 0)) + ' in the current versions',
          'danger',
        ],
        ['Wrapped keys', 'all of them, for every version', 'danger'],
        ['Audit entries kept', 'yes, the chain is append-only', 'ok'],
      ]

  return (
    <Modal
      open
      onClose={props.onClose}
      dismissable={!busy}
      width={640}
      title={one ? 'Delete permanently' : 'Empty trash'}
      subtitle="there is no recovery path after this"
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>
            {one ? 'Keep file' : 'Keep them'}
          </Button>
          <Button
            type="submit"
            form="purge"
            variant="danger"
            loading={busy}
            disabled={typed !== phrase}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <form id="purge" className={styles.form} onSubmit={purge}>
        <Callout tone="danger" icon="trash" title="Permanent deletion cannot be undone">
          {one
            ? `The ciphertext, ${detail.data?.versionCount === 1 ? 'its only version' : `all ${detail.data?.versionCount ?? ''} versions`} and every wrapped key copy are erased.`
            : 'The ciphertext, every version and every wrapped key copy of these files are erased.'}{' '}
          There is no backup that could bring it back.
        </Callout>

        <dl className={styles.rows}>
          {rows.map(([label, value, tone]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={tone && styles[tone]}>{value}</dd>
            </div>
          ))}
        </dl>

        <TextField
          label={one ? 'Type the file name to confirm' : `Type "${EMPTY_PHRASE}" to confirm`}
          value={typed}
          mono
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
          error={error || undefined}
          placeholder={phrase}
        />
      </form>
    </Modal>
  )
}
