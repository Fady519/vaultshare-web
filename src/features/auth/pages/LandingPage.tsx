import { Button, PagePlaceholder, SectionMark } from '@/components'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  useDocumentTitle('Zero-knowledge file collaboration')

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <SectionMark num="01">Zero-knowledge file collaboration</SectionMark>
        <h1 className={styles.title}>Files leave the browser already unreadable.</h1>
        <p className={styles.lead}>
          VaultShare encrypts every file in the tab it was chosen in. The server stores ciphertext,
          wrapped keys and an append-only audit chain — and nothing it holds is enough to read a
          single page of your work.
        </p>
        <div className={styles.cta}>
          <Button to="/signup" size="lg" className={styles.dark}>
            Create an account
          </Button>
          <Button to="/signin" size="lg" variant="ghost">
            Sign in
          </Button>
        </div>
      </section>
      <PagePlaceholder screen="01" title="Rest of the landing page" phase={2} />
    </div>
  )
}
