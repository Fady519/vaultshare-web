import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AvatarStack,
  Button,
  Callout,
  EmptyState,
  FileKindBox,
  Icon,
  Menu,
  PageHead,
  SkeletonRows,
} from '@/components'
import { useFavorites } from '@/api/files'
import type { FileDto } from '@/api/types'
import { useCrumbs } from '@/hooks/useCrumbs'
import { timeAgo } from '@/utils/format'
import { useFileNames } from '@/features/files/keys'
import { cipherMeta } from '@/features/files/plaintext'
import { toggleFavorite } from '@/features/files/actions'
import styles from './FavoritesPage.module.css'

type Sort = 'updated' | 'name' | 'size'

const SORT_LABEL: Record<Sort, string> = {
  updated: 'Recently updated',
  name: 'Name',
  size: 'Size',
}

// figma 19
export default function FavoritesPage() {
  useCrumbs('Favorites')
  const navigate = useNavigate()
  const favorites = useFavorites()
  const names = useFileNames(favorites.data)
  const [sort, setSort] = useState<Sort>('updated')

  const list = useMemo(() => {
    const items = [...(favorites.data ?? [])]
    const nameOf = (f: FileDto) => names.data?.[f.id] ?? ''
    if (sort === 'name') items.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    if (sort === 'size') items.sort((a, b) => b.sizeBytes - a.sizeBytes)
    return items
  }, [favorites.data, names.data, sort])

  const vaultCount = new Set(list.map((f) => f.vaultId)).size

  return (
    <>
      <PageHead
        title="Favorites"
        meta={
          favorites.data
            ? `${list.length} starred file${list.length === 1 ? '' : 's'}  ·  across ${vaultCount} vault${vaultCount === 1 ? '' : 's'}  ·  sorted by ${SORT_LABEL[sort].toLowerCase()}`
            : ' '
        }
        actions={
          <Menu
            label="Sort favorites"
            items={(Object.keys(SORT_LABEL) as Sort[]).map((key) => ({
              label: SORT_LABEL[key],
              onSelect: () => setSort(key),
            }))}
            trigger={(props) => (
              <Button variant="ghost" icon="chevD" {...props}>
                Sort
              </Button>
            )}
          />
        }
      />

      {favorites.isPending && <SkeletonRows rows={4} />}
      {favorites.isError && (
        <Callout tone="danger" title="Favorites could not be loaded">
          Try again in a moment.
        </Callout>
      )}

      {favorites.isSuccess && list.length === 0 && (
        <EmptyState icon="star" title="No favorites yet">
          Star a file from its menu in any vault and it shows up here, across all your vaults.
        </EmptyState>
      )}

      {list.length > 0 && (
        <>
          <ul className={styles.grid}>
            {list.map((f) => {
              const name = names.data?.[f.id] ?? '…'
              return (
                <li key={f.id} className={styles.card}>
                  <div className={styles.top}>
                    <FileKindBox mimeType={f.mimeType} name={name} size={30} />
                    <button
                      type="button"
                      className={styles.star}
                      aria-label={`Remove ${name} from favorites`}
                      title="Remove from favorites"
                      onClick={() => toggleFavorite(f)}
                    >
                      <Icon name="star" filled size={16} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.name}
                    onClick={() => navigate(`/files/${f.id}`)}
                  >
                    {name}
                  </button>
                  <p className={styles.meta}>{cipherMeta(f.currentVersion)}</p>
                  <div className={styles.foot}>
                    <span>
                      v{f.currentVersion.versionNo} · {timeAgo(f.updatedAt)} · {f.vaultName}
                    </span>
                    <AvatarStack people={f.people} size={24} />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className={styles.note}>
            Stars are kept with your account so they follow you to other devices. The server only
            sees which file ids you starred, never their names.
          </p>
        </>
      )}
    </>
  )
}
