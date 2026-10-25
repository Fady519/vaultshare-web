import { Button, ErrorState, toast } from '@/components'
import { ApiError, errorMessage } from '@/api/client'

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} copied.`, 'ok')
  } catch {
    toast('The browser did not allow copying here.', 'warn')
  }
}

/*
  What a page shows when its main request fails (figma 50). The server answers
  404 both for "doesn't exist" and "not yours", on purpose, so the wording
  covers both and never guesses which one it was.
*/
export function LoadError({
  error,
  thing,
  onRetry,
}: {
  error: unknown
  // "vault", "file"…
  thing: string
  onRetry?: () => void
}) {
  const status = error instanceof ApiError ? error.status : null
  const retry = onRetry && (
    <Button variant="ghost" onClick={onRetry}>
      Try again
    </Button>
  )

  if (status === 404) {
    return (
      <ErrorState
        code="404"
        title={`This ${thing} doesn't exist for you`}
        actions={
          <>
            <Button to="/vaults">Back to your vaults</Button>
            <Button variant="ghost" onClick={() => copy(window.location.href, 'Link')}>
              Copy the link
            </Button>
          </>
        }
      >
        It was deleted, or you are not a member of it. The server gives the same answer to both, so
        nobody can find out what exists by guessing addresses. If someone sent you this link, ask
        them to share it again.
      </ErrorState>
    )
  }

  if (status === 403) {
    return (
      <ErrorState
        tone="warn"
        icon="lock"
        code="403 · role"
        title="Your role doesn't allow this"
        actions={<Button to="/vaults">Back to your vaults</Button>}
      >
        {errorMessage(error)} Roles are checked by the server, and only the owner or a manager of
        the vault can change yours. An administrator can't.
      </ErrorState>
    )
  }

  if (status === 0) {
    return (
      <ErrorState
        tone="warn"
        icon="shield"
        code="offline"
        title="The server could not be reached"
        actions={retry}
      >
        Nothing was sent or changed. Files already decrypted in this tab stay readable; this one
        loads when the connection is back.
      </ErrorState>
    )
  }

  return (
    <ErrorState
      tone="danger"
      icon="shield"
      code={status ? `${status} · server` : 'error'}
      title={`The ${thing} could not be loaded`}
      actions={retry}
    >
      The server answered with an error and nothing was changed. {errorMessage(error)}
    </ErrorState>
  )
}

// figma 50, "no key for you": the ciphertext is visible, no data key is wrapped to this person
export function NoKeyState({ objectId, thing }: { objectId: string; thing: string }) {
  return (
    <ErrorState
      tone="warn"
      icon="lock"
      code="403 · no key for you"
      title="You can see it, you can't open it"
      actions={
        <>
          <Button to="/vaults">Back to your vaults</Button>
          <Button variant="ghost" onClick={() => copy(objectId, 'Object id')}>
            Copy object id
          </Button>
        </>
      }
    >
      This {thing} exists and you hold its ciphertext, but no data key is wrapped to your public key
      yet. An owner or manager has to share it with you; an administrator can't, because there is no
      key for them to hand over.
    </ErrorState>
  )
}
