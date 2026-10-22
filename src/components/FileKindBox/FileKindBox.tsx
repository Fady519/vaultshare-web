import { fileKind } from './fileKind'
import styles from './FileKindBox.module.css'

type Props = {
  mimeType: string
  name?: string
  size?: 30 | 40
}

// there are no thumbnails on the server (it can't read the file), so the kind box replaces them
export function FileKindBox({ mimeType, name, size = 30 }: Props) {
  return (
    <span className={styles.box} style={{ width: size, height: size }} aria-hidden>
      {fileKind(mimeType, name)}
    </span>
  )
}
