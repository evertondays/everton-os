import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type OS, OSContext } from '../../system/os.ts'
import { settings } from '../../system/settings.ts'
import { useStore } from '../../system/store.ts'
import { useWallpaper } from '../../system/wallpapers.ts'
import { AppMenu } from './AppMenu.tsx'
import { Boot } from './Boot.tsx'
import { DesktopIcons } from './DesktopIcons.tsx'
import { Login } from './Login.tsx'
import { Panel } from './Panel.tsx'
import { Switcher } from './Switcher.tsx'
import { Window } from './Window.tsx'
import { closeAllWindows, openWindow, windows } from './windows.ts'
import './desktop.css'

type Phase = 'boot' | 'login' | 'desktop'

// Boot and login play once per tab; a reload goes straight back to the desktop.
const SESSION_KEY = 'everton-os:session'

function initialPhase(): Phase {
  if (sessionStorage.getItem(SESSION_KEY)) return 'desktop'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'login' : 'boot'
}

export default function DesktopShell() {
  const [phase, setPhase] = useState<Phase>(initialPhase)

  const showLogin = useCallback(() => setPhase('login'), [])

  if (phase === 'boot') return <Boot onDone={showLogin} />
  if (phase === 'login') {
    return (
      <Login
        onEnter={() => {
          sessionStorage.setItem(SESSION_KEY, '1')
          setPhase('desktop')
        }}
      />
    )
  }
  return (
    <Desktop
      onLogout={() => {
        sessionStorage.removeItem(SESSION_KEY)
        setPhase('login')
      }}
    />
  )
}

function Desktop({ onLogout }: { onLogout(): void }) {
  const wallpaper = useWallpaper()
  const list = useStore(windows, (s) => s.windows)
  const [menuOpen, setMenuOpen] = useState(false)
  const firstVisit = useRef(!settings.get().visited)

  const os = useMemo<OS>(() => ({ shell: 'desktop', open: openWindow }), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    // A first-time visitor is greeted with the About me app.
    if (firstVisit.current) openWindow('about')
    settings.set({ visited: true })
    return closeAllWindows
  }, [])

  useEffect(() => {
    // Super toggles the menu when pressed and released on its own.
    let alone = false
    const onKeyDown = (event: KeyboardEvent) => {
      alone = event.key === 'Meta'
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Meta' && alone) setMenuOpen((open) => !open)
      alone = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <OSContext.Provider value={os}>
      <div className="desktop" style={{ backgroundImage: wallpaper.css }}>
        <DesktopIcons />
        {list.map((win) => (
          <Window key={win.id} win={win} />
        ))}
        {menuOpen && <AppMenu onClose={closeMenu} onLogout={onLogout} />}
        <Panel menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
        <Switcher />
      </div>
    </OSContext.Provider>
  )
}
