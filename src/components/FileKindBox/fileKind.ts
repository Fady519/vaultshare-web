const BY_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'text/markdown': 'MD',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'application/json': 'JSON',
}

// short label for the kind box: "PDF", "DOC", "XLS"...
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
