import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Callout, Chip, EmptyState, FileKindBox, Menu, SearchBar, SkeletonRows } from '@/components'
import { useFileIndex } from '@/api/files'
import type { FileDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { useUi } from '@/store/ui'
import { shortName, timeAgo } from '@/utils/format'
import { useFileNames, useVersionNotes } from '@/features/files/keys'
import styles from './SearchPage.module.css'

type Kind = 'all' | 'pdf' | 'text' | 'sheet' | 'image' | 'other'

const KINDS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Any type' },
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: 'Text & Markdown' },
  { value: 'sheet', label: 'Spreadsheet' },
  { value: 'image', label: 'Image' },
  { value: 'other', label: 'Other' },
]

const DATES = [
  { value: 0, label: 'Any time' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
]

function kindOf(mime: string): Kind {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/csv' || mime.includes('spreadsheet') || mime.includes('excel')) return 'sheet'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('text/')) return 'text'
  return 'other'
}

// wraps every occurrence of the query in <mark>
function highlight(text: string, q: string): ReactNode {
  if (!q) return text
  const out: ReactNode[] = []
  const lower = text.toLowerCase()
  let from = 0
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    out.push(text.slice(from, i), <mark key={i}>{text.slice(i, i + q.length)}</mark>)
    from = i + q.length
  }
  out.push(text.slice(from))
  return out
}

type Hit = { file: FileDto; name: string; why: string }

/*
  figma 21. The server hands over the encrypted index (/files/index), names and
  notes are decrypted in this tab and matched here. The words never leave it.
*/
export default function SearchPage() {
  useCrumbs('Search')
  const navigate = useNavigate()
  const query = useUi((s) => s.searchQuery)
  const setQuery = useUi((s) => s.setSearchQuery)
  const index = useFileIndex()
  const names = useFileNames(index.data)
  const notes = useVersionNotes(index.data?.map((f) => f.currentVersion))

  const [kind, setKind] = useState<Kind>('all')
  const [days, setDays] = useState(0)
  const [owner, setOwner] = useState<string | null>(null)
  const [vault, setVault] = useState<string | null>(null)

  const owners = useMemo(
    () => [...new Map((index.data ?? []).map((f) => [f.ownerId, f.ownerName]))],
    [index.data],
  )
  const vaults = useMemo(
    () => [...new Map((index.data ?? []).map((f) => [f.vaultId, f.vaultName]))],
    [index.data],
  )

  const q = query.trim().toLowerCase()
  const filtered = kind !== 'all' || days > 0 || owner !== null || vault !== null

  const { hits, ms } = useMemo(() => {
    const started = performance.now()
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : ''
    const hits: Hit[] = []
    for (const f of index.data ?? []) {
      if (kind !== 'all' && kindOf(f.mimeType) !== kind) continue
      if (since && f.updatedAt < since) continue
      if (owner && f.ownerId !== owner) continue
      if (vault && f.vaultId !== vault) continue
      const name = names.data?.[f.id] ?? ''
      const note = notes.data?.[f.currentVersion.id] ?? ''
      if (q) {
        if (name.toLowerCase().includes(q))
          hits.push({ file: f, name, why: `filename match · ${q}` })
        else if (note.toLowerCase().includes(q))
          hits.push({ file: f, name, why: `note match · ${note}` })
        continue
      }
      hits.push({ file: f, name, why: f.mimeType })
    }
    hits.sort((a, b) => b.file.updatedAt.localeCompare(a.file.updatedAt))
    return { hits, ms: Math.max(1, Math.round(performance.now() - started)) }
  }, [index.data, names.data, notes.data, q, kind, days, owner, vault])

  const ready = index.isSuccess && names.isSuccess

  return (
    <>
      <h1 className={styles.title}>Search</h1>
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <SearchBar
          size="lg"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="File name or version note"
          label="Search your files"
        />
      </form>

      <div className={styles.filters}>
        <Menu
          label="File type"
          align="left"
          items={KINDS.map((k) => ({ label: k.label, onSelect: () => setKind(k.value) }))}
          trigger={(props) => (
            <Chip on={kind !== 'all'} {...props}>
              File type: {KINDS.find((k) => k.value === kind)!.label}
            </Chip>
          )}
        />
        <Menu
          label="Date"
          align="left"
          items={DATES.map((d) => ({ label: d.label, onSelect: () => setDays(d.value) }))}
          trigger={(props) => (
            <Chip on={days > 0} {...props}>
              Date: {DATES.find((d) => d.value === days)!.label.toLowerCase()}
            </Chip>
          )}
        />
        <Menu
          label="Owner"
          align="left"
          items={[
            { label: 'Anyone', onSelect: () => setOwner(null) },
            ...owners.map(([id, n]) => ({ label: n, onSelect: () => setOwner(id) })),
          ]}
          trigger={(props) => (
            <Chip on={owner !== null} {...props}>
              Owner: {owner ? shortName(owners.find(([id]) => id === owner)?.[1] ?? '') : 'anyone'}
            </Chip>
          )}
        />
        <Menu
          label="Vault"
          align="left"
          items={[
            { label: 'All vaults', onSelect: () => setVault(null) },
            ...vaults.map(([id, n]) => ({ label: n, onSelect: () => setVault(id) })),
          ]}
          trigger={(props) => (
            <Chip on={vault !== null} {...props}>
              Vault: {vault ? vaults.find(([id]) => id === vault)?.[1] : 'all'}
            </Chip>
          )}
        />
        {filtered && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              setKind('all')
              setDays(0)
              setOwner(null)
              setVault(null)
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {index.isError && (
        <Callout tone="danger" title="The file index could not be loaded">
          Try again in a moment.
        </Callout>
      )}
      {!ready && !index.isError && <SkeletonRows rows={5} />}

      {ready && (
        <>
          <p className={styles.stats}>
            {q || filtered
              ? `${hits.length} result${hits.length === 1 ? '' : 's'}  ·  searched ${index.data.length} encrypted files in ${ms} ms, locally`
              : `${index.data.length} files you can read  ·  type to search their names and version notes`}
          </p>

          {(q || filtered) && hits.length === 0 && (
            <EmptyState
              icon="search"
              title={q ? `No match for “${q}”` : 'Nothing matches these filters'}
            >
              Names are encrypted, so the search runs here in this tab over the {index.data.length}{' '}
              files you can decrypt. Names and notes are compared as typed, case aside.
            </EmptyState>
          )}

          {(q || filtered) && (
            <ul className={styles.results}>
              {hits.map((h) => (
                <li key={h.file.id} className={styles.row}>
                  <FileKindBox mimeType={h.file.mimeType} name={h.name} />
                  <div className={styles.text}>
                    <button type="button" onClick={() => navigate(`/files/${h.file.id}`)}>
                      {highlight(h.name, q)}
                    </button>
                    <span>{h.why}</span>
                  </div>
                  <span className={styles.vault}>{h.file.vaultName}</span>
                  <span className={styles.mono}>v{h.file.currentVersion.versionNo}</span>
                  <span className={styles.owner}>{shortName(h.file.ownerName)}</span>
                  <span className={styles.when}>{timeAgo(h.file.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <p className={styles.note}>
            Search runs on names and notes decrypted in this tab. The server can't answer "who has a
            file called {query.trim() || '…'}?" — it never sees the words.
          </p>
        </>
      )}
    </>
  )
}
