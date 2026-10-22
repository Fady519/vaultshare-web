import { Button } from '@/components'
import { StepCard } from '@/layouts/StepCard/StepCard'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import styles from './ErrorPage.module.css'

export default function NotFoundPage() {
  useDocumentTitle('Not found')

  return (
    <StepCard width={640}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>There is nothing at this address</h1>
      <p className={styles.text}>
        The link may be mistyped, or the thing it pointed to was moved. If someone shared it with
        you, ask them to send it again.
      </p>
      <div>
        <Button to="/vaults" variant="ghost">
          Go to your vaults
        </Button>
      </div>
    </StepCard>
  )
}
