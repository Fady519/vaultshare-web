import { setupWorker } from 'msw/browser'
import { initDb } from './db'
import { handlers } from './handlers'

export async function startMocks() {
  await initDb()
  const worker = setupWorker(...handlers)
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
}
