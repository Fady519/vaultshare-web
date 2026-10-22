import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

async function start() {
  // fake backend until the real one is ready (VITE_USE_MOCKS in .env)
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

start()
