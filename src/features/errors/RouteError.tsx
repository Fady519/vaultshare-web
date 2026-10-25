import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button, ErrorState } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import styles from './ErrorPage.module.css'

// every page is a separate chunk; offline or right after a deploy, fetching one can fail
const isChunkError = (e: unknown) =>
  e instanceof Error &&
  /dynamically imported module|Importing a module script failed/i.test(e.message)

// last line of defence when a page throws while rendering
export default function RouteError() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : null
  const message = error instanceof Error ? error.message : null
  const reload = (
    <Button variant="ghost" onClick={() => window.location.reload()}>
      Reload
    </Button>
  )

  if (isChunkError(error)) {
    return (
      <StepCard width={720}>
        <ErrorState
          tone="warn"
          icon="down"
          code="not downloaded"
          title="This screen couldn't be downloaded"
          actions={reload}
        >
          {navigator.onLine
            ? 'A newer version of VaultShare was probably published while this tab was open. Reloading fetches it; your vault locks, so you will need your password.'
            : 'You are offline, and this part of the app was never downloaded to this tab. Reload once the connection is back.'}
        </ErrorState>
      </StepCard>
    )
  }

  return (
    <StepCard width={720}>
      <ErrorState
        tone="danger"
        icon="shield"
        code={status ? String(status) : 'error'}
        title="This screen failed to load"
        actions={reload}
      >
        Nothing was sent or changed. Reload the page; if it keeps happening, the details below help
        find it.
      </ErrorState>
      {message && <pre className={styles.detail}>{message}</pre>}
    </StepCard>
  )
}
