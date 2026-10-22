import { setupWorker } from 'msw/browser'
import { initDb } from './db'
import { handlers } from './handlers'

// resolves to false when the mock service worker isn't the one answering this tab
export async function startMocks() {
  await initDb()
  const worker = setupWorker(...handlers)
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  return mockIsAnswering()
}

/*
  worker.start() can succeed while the page still isn't controlled by it:
  after a hard reload (Ctrl+Shift+R skips service workers) or when another
  project left its own service worker on the same localhost port. Requests
  then go to the Vite proxy, which has no backend behind it, and come back 500.
*/
async function mockIsAnswering() {
  try {
    const res = await fetch('/__dev/ping', { cache: 'no-store' })
    const body = (await res.json()) as { mock?: boolean }
    return body.mock === true
  } catch {
    return false
  }
}
