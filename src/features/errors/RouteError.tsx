import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import styles from './ErrorPage.module.css'

// last line of defence when a page throws while rendering
export default function RouteError() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : null
  const message = error instanceof Error ? error.message : null

  return (
    <StepCard width={640}>
      <p className={styles.code}>{status ?? 'Error'}</p>
      <h1 className={styles.title}>This screen failed to load</h1>
      <p className={styles.text}>
        Nothing was sent or changed. Reload the page; if it keeps happening, the details below help
        us find it.
      </p>
      {message && <pre className={styles.detail}>{message}</pre>}
      <div>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </StepCard>
  )
}
