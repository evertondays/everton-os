import { Suspense, lazy, useEffect, useSyncExternalStore } from 'react'
import { setContext } from './analytics.ts'

// Each shell is its own chunk: a phone never downloads the window manager,
// and a computer never downloads the phone interface.
const DesktopShell = lazy(() => import('./shells/desktop/DesktopShell.tsx'))
const MobileShell = lazy(() => import('./shells/mobile/MobileShell.tsx'))

// Small or touch-first screens get the phone interface: floating windows
// don't work well under a finger.
const mobileQuery = window.matchMedia('(max-width: 768px), (pointer: coarse)')

function subscribe(listener: () => void) {
  mobileQuery.addEventListener('change', listener)
  return () => mobileQuery.removeEventListener('change', listener)
}

export default function App() {
  const mobile = useSyncExternalStore(subscribe, () => mobileQuery.matches)

  useEffect(() => {
    setContext({ shell: mobile ? 'mobile' : 'desktop' })
  }, [mobile])

  return <Suspense fallback={null}>{mobile ? <MobileShell /> : <DesktopShell />}</Suspense>
}
