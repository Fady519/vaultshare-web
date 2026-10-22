import styles from './FileKindBox.module.css'

const BY_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'text/markdown': 'MD',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'application/json': 'JSON',
}

// there are no thumbnails on the server (it can't read the file), so the kind box replaces them
export function fileKind(mimeType: string, name?: string) {
  if (BY_MIME[mimeType]) return BY_MIME[mimeType]
  if (mimeType.startsWith('image/')) return 'IMG'
  if (mimeType.startsWith('video/')) return 'VID'
  if (mimeType.includes('word')) return 'DOC'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'XLS'
  if (mimeType.includes('presentation')) return 'PPT'
  const ext = name?.split('.').pop()
  if (ext && ext.length <= 4 && ext !== name) return ext.toUpperCase()
  return 'BIN'
}

type Props = {
  mimeType: string
  name?: string
  size?: 30 | 40
}

export function FileKindBox({ mimeType, name, size = 30 }: Props) {
  return (
    <span className={styles.box} style={{ width: size, height: size }} aria-hidden>
      {fileKind(mimeType, name)}
    </span>
  )
}
