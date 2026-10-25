import { Button, ErrorState } from '@/components'
import { errorMessage } from '@/api/client'
import { DecryptError, IntegrityError } from '@/crypto'

// figma 50, "tag mismatch": shown instead of a preview when a version fails its checks
export function DecryptRefused({
  error,
  chunkCount,
  onRetry,
}: {
  error: unknown
  chunkCount: number
  onRetry: () => void
}) {
  const retry = (
    <Button variant="ghost" onClick={onRetry}>
      Try again
    </Button>
  )

  if (error instanceof IntegrityError) {
    const digest = /digest/.test(error.message)
    return (
      <ErrorState
        heading="h2"
        tone="danger"
        icon="shield"
        code={digest ? 'digest mismatch' : 'tag mismatch'}
        title="Decryption refused"
        actions={retry}
      >
        {digest
          ? `Chunk ${error.index + 1} of ${chunkCount} does not hash to the digest recorded when it was uploaded.`
          : `The GCM authentication tag did not match on chunk ${error.index + 1} of ${chunkCount}.`}{' '}
        The bytes changed after they were sealed, so nothing from this version was rendered or
        written to disk.
      </ErrorState>
    )
  }

  if (error instanceof DecryptError) {
    return (
      <ErrorState
        heading="h2"
        tone="danger"
        icon="key"
        code="key mismatch"
        title="Decryption failed"
        actions={retry}
      >
        The data key wrapped for you did not open this version. Nothing was rendered. If it keeps
        happening, the key you hold is out of date: ask the owner to share the file again.
      </ErrorState>
    )
  }

  return (
    <ErrorState
      heading="h2"
      tone="danger"
      icon="shield"
      code="error"
      title="The preview failed"
      actions={retry}
    >
      Nothing was rendered. {errorMessage(error)}
    </ErrorState>
  )
}
