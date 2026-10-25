import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Callout, EmptyState, ErrorState, FileKindBox, Icon, TextField } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { ApiError, errorMessage } from '@/api/client'
import { sharingApi } from '@/api/sharing'
import type { PublicLinkDto } from '@/api/types'
import {
  DecryptError,
  decryptText,
  fromBase64Url,
  IntegrityError,
  nameAad,
  openFromLink,
} from '@/crypto'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import { formatBytes, formatDate } from '@/utils/format'
import { decryptChunks, saveBlob, type DownloadProgress } from '@/features/files/download'
import { FilePreview } from '@/features/files/components/FilePreview'
import { StepList, type Step } from '@/features/files/components/StepList'
import styles from './OpenLinkPage.module.css'

// the key from the #fragment, kept for this tab only (a reload, or the sign-in round trip)
const keySlot = (token: string) => `vaultshare.link-key.${token}`

function takeFragmentKey(token: string) {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('k')
  if (fromHash) {
    sessionStorage.setItem(keySlot(token), fromHash)
    // out of the address bar, so it doesn't sit in history or show on a shared screen
    history.replaceState(null, '', location.pathname)
  }
  return fromHash ?? sessionStorage.getItem(keySlot(token))
}

type State =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'no-key' }
  | { kind: 'sign-in' }
  | { kind: 'passphrase'; link: PublicLinkDto; error?: string }
  | { kind: 'ready'; link: PublicLinkDto; key: CryptoKey; name: string }
  | { kind: 'broken'; message: string }

/*
  The public end of a secure link. Nothing here needs an account: the server
  hands over the sealed key and the ciphertext, the key to open them came in
  the link itself. Every chunk is checked like any other download.
*/
export default function OpenLinkPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const fragment = useRef<string | null>(null)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [passphrase, setPassphrase] = useState('')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [showing, setShowing] = useState(false)
  useDocumentTitle(state.kind === 'ready' ? state.name : 'Shared file')

  useEffect(() => {
    fragment.current = takeFragmentKey(token)
    if (!fragment.current) return setState({ kind: 'no-key' })
    sharingApi
      .publicLink(token)
      .then((link) => (link.passphraseSalt ? setState({ kind: 'passphrase', link }) : unlock(link)))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'LINK_GONE') setState({ kind: 'gone' })
        else if (err instanceof ApiError && err.status === 401) setState({ kind: 'sign-in' })
        else setState({ kind: 'broken', message: errorMessage(err) })
      })
  }, [token])

  async function unlock(link: PublicLinkDto, words?: string) {
    try {
      const key = await openFromLink(
        link.reWrapped,
        link.versionId,
        fromBase64Url(fragment.current!),
        words,
        link.passphraseSalt,
      )
      const name = await decryptText(key, link.encName, link.nameIv, nameAad(link.fileId))
      setState({ kind: 'ready', link, key, name })
    } catch (err) {
      if (!(err instanceof DecryptError)) throw err
      if (link.passphraseSalt) {
        setState({ kind: 'passphrase', link, error: "That passphrase doesn't open this link." })
      } else {
        setState({
          kind: 'broken',
          message:
            'The key in this link does not fit. It may have been cut off when it was copied.',
        })
      }
    }
  }

  async function fetchPlaintext(s: Extract<State, { kind: 'ready' }>) {
    if (blob) return blob
    setFailure(null)
    setProgress({ stage: 'fetch', chunk: 0, chunkCount: s.link.chunkCount })
    try {
      const { chunks } = await sharingApi.publicDownload(token)
      const plain = await decryptChunks(
        s.link.fileId,
        s.link.versionId,
        s.key,
        { mimeType: s.link.mimeType, chunkCount: s.link.chunkCount, chunks },
        setProgress,
      )
      setBlob(plain)
      return plain
    } catch (err) {
      setFailure(
        err instanceof IntegrityError
          ? `Chunk ${err.index + 1} was rejected (${err.message.split(': ')[1]}). Nothing was shown or saved.`
          : err instanceof ApiError && err.code === 'LINK_GONE'
            ? 'The link stopped working just now: it may have run out of opens.'
            : errorMessage(err),
      )
      return null
    }
  }

  if (state.kind === 'loading') {
    return (
      <StepCard width={720}>
        <p className={styles.wait}>Opening the link…</p>
      </StepCard>
    )
  }

  if (state.kind === 'gone' || state.kind === 'no-key' || state.kind === 'broken') {
    return (
      <StepCard width={720}>
        <ErrorState
          tone={state.kind === 'broken' ? 'danger' : 'warn'}
          icon="lock"
          code={
            state.kind === 'gone'
              ? '410 · link gone'
              : state.kind === 'no-key'
                ? 'no key'
                : 'broken'
          }
          title={state.kind === 'gone' ? 'This link no longer works' : "This link can't be opened"}
        >
          {state.kind === 'gone'
            ? 'It may have expired, run out of opens, or been revoked. The server gives the same answer for all of those, on purpose.'
            : state.kind === 'no-key'
              ? 'The part after # is missing, and that part is the key. Ask for the full link again.'
              : state.message}
        </ErrorState>
      </StepCard>
    )
  }

  if (state.kind === 'sign-in') {
    return (
      <StepCard width={720}>
        <EmptyState
          icon="users"
          title="Sign in to open this file"
          actions={
            <Button onClick={() => navigate(`/signin?next=${encodeURIComponent(`/s/${token}`)}`)}>
              Sign in
            </Button>
          }
        >
          Whoever shared it asked for a VaultShare sign-in on top of the link. The key in the link
          stays in this tab while you sign in.
        </EmptyState>
      </StepCard>
    )
  }

  if (state.kind === 'passphrase') {
    const submit = async (e: FormEvent) => {
      e.preventDefault()
      setState({ ...state, error: undefined })
      await unlock(state.link, passphrase)
    }
    return (
      <StepCard width={620}>
        <form className={styles.form} onSubmit={submit}>
          <h1 className={styles.title}>This link needs a passphrase</h1>
          <p className={styles.lead}>
            The person who sent it should have given it to you another way. It's stretched with
            Argon2id right here and never sent anywhere.
          </p>
          <TextField
            label="Passphrase"
            type="password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            error={state.error}
          />
          <Button type="submit" size="lg" disabled={!passphrase}>
            Open
          </Button>
        </form>
      </StepCard>
    )
  }

  const { link, name } = state
  const at = progress ? ['fetch', 'unwrap', 'chunks', 'done'].indexOf(progress.stage) : -1
  const steps: Step[] = [
    {
      label: 'Open the sealed key with the key in the link',
      detail: 'AES-256-GCM · in tab',
      state: 'done',
    },
    {
      label: 'Fetch the ciphertext',
      detail: 'presigned URLs',
      state: at < 0 ? 'todo' : at === 0 ? 'active' : 'done',
    },
    {
      label: 'Decrypt and verify every chunk',
      detail: progress
        ? `${progress.chunk} of ${progress.chunkCount}`
        : `${link.chunkCount} chunks`,
      state: failure ? 'failed' : at < 2 ? 'todo' : at === 2 ? 'active' : 'done',
    },
  ]

  return (
    <StepCard width={showing ? 880 : 720}>
      <div className={styles.body}>
        <p className={styles.kicker}>Shared with you through a secure link</p>
        <div className={styles.file}>
          <FileKindBox mimeType={link.mimeType} name={name} size={40} />
          <div className={styles.fileText}>
            <h1>{name}</h1>
            <p>
              {formatBytes(link.sizeBytes)} · link works until {formatDate(link.expiresAt)}
              {link.downloadsLeft !== null ? ` · ${link.downloadsLeft} opens left` : ''}
            </p>
          </div>
        </div>

        <StepList steps={steps} />

        {failure && (
          <Callout tone="danger" title="Not opened">
            {failure}
          </Callout>
        )}

        <div className={styles.actions}>
          <Button
            icon="eye"
            variant={link.allowDownload ? 'ghost' : 'primary'}
            onClick={async () => {
              if (await fetchPlaintext(state)) setShowing(true)
            }}
          >
            Open here
          </Button>
          {link.allowDownload && (
            <Button
              icon="down"
              onClick={async () => {
                const plain = await fetchPlaintext(state)
                if (plain) saveBlob(plain, name)
              }}
            >
              Download
            </Button>
          )}
        </div>
        {!link.allowDownload && (
          <p className={styles.note}>
            The sender turned saving off, so this page only shows the file.
          </p>
        )}

        {showing && blob && (
          <FilePreview blob={blob} mimeType={link.mimeType} name={name} compact />
        )}

        <p className={styles.note}>
          <Icon name="shield" size={12} /> VaultShare never had the key to this file. It came in the
          link, after the #, which browsers don't send to any server. Each open is counted.
        </p>
      </div>
    </StepCard>
  )
}
