import { PagePlaceholder } from '@/components'
import { useCrumbs } from '@/hooks/useCrumbs'

export default function FavoritesPage() {
  useCrumbs('Favorites')
  return <PagePlaceholder screen="19" title="Favorites" phase={4} />
}
