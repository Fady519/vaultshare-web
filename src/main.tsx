import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { MockOffline } from './features/errors/MockOffline'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

const RELOAD_KEY = 'vaultshare.mock-reload'

async function start() {
  const root = createRoot(document.getElementById('root')!)

  // fake backend until the real one is ready (VITE_USE_MOCKS in .env)
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { startMocks } = await import('./mocks/browser')
    const mocks = await startMocks()

    if (!mocks.ok) {
      // one normal reload usually hands the tab to the service worker
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1')
        window.location.reload()
        return
      }
      root.render(<MockOffline reason={mocks.reason} />)
      return
    }
    sessionStorage.removeItem(RELOAD_KEY)
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

start()
