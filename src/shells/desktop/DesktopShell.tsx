import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import { useFsReady } from '../../system/fs.ts'
import { OSContext, type ShellOS } from '../../system/os.ts'
import { settings } from '../../system/settings.ts'
import { useStore } from '../../system/store.ts'
import { useWallpaper } from '../../system/wallpapers.ts'
import { AppMenu } from './AppMenu.tsx'
import { Boot } from './Boot.tsx'
import { CalendarFlyout } from './CalendarFlyout.tsx'
import { DesktopIcons } from './DesktopIcons.tsx'
import { Login } from './Login.tsx'
import { Panel } from './Panel.tsx'
import { SnapAssist } from './SnapAssist.tsx'
import { Switcher } from './Switcher.tsx'
import { Window } from './Window.tsx'
import { closeAllWindows, killWindow, openWindow, windows } from './windows.ts'
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
  // Boot and login usually outlast loading the visitor's files; a reload, which skips them, may not.
  const ready = useFsReady()

  const showLogin = useCallback(() => setPhase('login'), [])

  if (phase === 'boot') return <Boot onDone={showLogin} />
  if (phase === 'desktop' && !ready) return <Loading />
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
        track('session_logged_out', { open_windows: windows.get().windows.length })
        sessionStorage.removeItem(SESSION_KEY)
        setPhase('login')
      }}
    />
  )
}

/** The empty desktop, while the file system mounts. */
function Loading() {
  const wallpaper = useWallpaper()
  return <div className="desktop" style={{ backgroundImage: wallpaper.css }} aria-busy />
}

function Desktop({ onLogout }: { onLogout(): void }) {
  const wallpaper = useWallpaper()
  const list = useStore(windows, (s) => s.windows)
  const [menuOpen, setMenuOpen] = useState(false)
  const firstVisit = useRef(!settings.get().visited)
  const menuTrigger = useRef<'panel_button' | 'super_key'>('panel_button')

  const os = useMemo<ShellOS>(() => ({ shell: 'desktop', exec: openWindow, kill: killWindow }), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  // The calendar that opens from the clock in the panel.
  const [calendarOpen, setCalendarOpen] = useState(false)
  const closeCalendar = useCallback(() => setCalendarOpen(false), [])

  useEffect(() => {
    // A first-time visitor is greeted with the About me app.
    if (firstVisit.current) openWindow('about', {}, 'first_visit')
    settings.set({ visited: true })
    return closeAllWindows
  }, [])

  useEffect(() => {
    if (menuOpen) track('app_menu_opened', { trigger: menuTrigger.current })
  }, [menuOpen])

  useEffect(() => {
    // Super toggles the menu when pressed and released on its own.
    let alone = false
    const onKeyDown = (event: KeyboardEvent) => {
      alone = event.key === 'Meta'
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Meta' && alone) {
        menuTrigger.current = 'super_key'
        setMenuOpen((open) => !open)
      }
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
        {calendarOpen && <CalendarFlyout onClose={closeCalendar} />}
        <Panel
          menuOpen={menuOpen}
          onToggleMenu={() => {
            menuTrigger.current = 'panel_button'
            setMenuOpen((open) => !open)
          }}
          calendarOpen={calendarOpen}
          onToggleCalendar={() => {
            if (!calendarOpen) track('calendar_opened')
            setCalendarOpen((open) => !open)
          }}
        />
        <Switcher />
        <SnapAssist />
      </div>
    </OSContext.Provider>
  )
}
