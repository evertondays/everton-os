import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/base.css'
import './styles/apps.css'
import './posthog.ts'
import App from './App.tsx'
import { isPreloading } from './system/apps.ts'

const RELOADED_KEY = 'everton-os:reloaded-for-deploy'

// Each app is its own chunk. A page loaded before a deploy asks for chunks the
// deploy removed, and that app never opens. Reload once to get the new build;
// if the reload didn't help, let the error through (it reaches error tracking).
window.addEventListener('vite:preloadError', (event) => {
  // Apps loaded ahead of time (preloadApps) don't reload the page: they load again when opened.
  if (isPreloading()) {
    event.preventDefault()
    return
  }
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_KEY) ?? 0) < 10_000) return
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
  } catch {
    // No storage, so no way to tell a first failure from a loop: don't reload.
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
