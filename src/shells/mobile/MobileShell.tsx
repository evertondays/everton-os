import { BatteryFull, ChevronLeft, Lock, Signal, Wifi } from 'lucide-react'
import { type PointerEvent, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { AppIcon } from '../../components/AppIcon.tsx'
import { useLocale, useT } from '../../i18n/index.ts'
import { type AppArgs, type AppDef, type AppId, appList, apps, resumeShortcut } from '../../system/apps.ts'
import { formatDate, formatTime } from '../../system/format.ts'
import { RESUME_PATH } from '../../system/fs.ts'
import { type AppWindow, AppWindowContext, type OS, OSContext, useOS } from '../../system/os.ts'
import { settings } from '../../system/settings.ts'
import { useClock } from '../../system/useClock.ts'
import { useWallpaper } from '../../system/wallpapers.ts'
import './mobile.css'

// The phone shell: lock screen, home screen with a dock, and apps in full
// screen. The apps are the same components the desktop puts in windows.

const DOCK: AppId[] = ['contact', 'browser', 'gallery', 'files']
const ICONS_PER_PAGE = 20
const CLOSE_ANIMATION = 220

interface Screen {
  key: number
  appId: AppId
  args?: AppArgs
  /** Where the tap that opened it landed; the app zooms in from there. */
  origin: { x: number; y: number }
}

export default function MobileShell() {
  const wallpaper = useWallpaper()
  const [locked, setLocked] = useState(true)
  // Apps can open other apps (Files opens the Viewer), so screens stack.
  const [screens, setScreens] = useState<Screen[]>([])
  const [closing, setClosing] = useState(false)
  const lastTap = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const sequence = useRef(0)
  const firstVisit = useRef(!settings.get().visited)

  const open = useCallback((appId: AppId, args?: AppArgs) => {
    const screen: Screen = { key: ++sequence.current, appId, args, origin: lastTap.current }
    setScreens((list) => [...list, screen])
  }, [])

  const os = useMemo<OS>(() => ({ shell: 'mobile', open }), [open])

  const back = useCallback(() => setScreens((list) => list.slice(0, -1)), [])

  const goHome = useCallback(() => {
    setClosing(true)
    window.setTimeout(() => {
      setScreens([])
      setClosing(false)
    }, CLOSE_ANIMATION)
  }, [])

  const unlock = useCallback(() => {
    setLocked(false)
    // A first-time visitor is greeted with the About me app.
    if (firstVisit.current) {
      firstVisit.current = false
      open('about')
    }
    settings.set({ visited: true })
  }, [open])

  return (
    <OSContext.Provider value={os}>
      <div
        className="ios"
        style={{ backgroundImage: wallpaper.css }}
        onPointerDownCapture={(event) => {
          lastTap.current = { x: event.clientX, y: event.clientY }
        }}
      >
        <StatusBar overApp={screens.length > 0 && !locked} />
        <HomeScreen />
        {screens.map((screen, index) => (
          <AppScreen
            key={screen.key}
            screen={screen}
            active={index === screens.length - 1}
            closing={closing}
            onBack={index > 0 ? back : undefined}
            onClose={index > 0 ? back : goHome}
          />
        ))}
        {screens.length > 0 && <HomeBar onHome={goHome} />}
        {locked && <LockScreen onUnlock={unlock} />}
      </div>
    </OSContext.Provider>
  )
}

function StatusBar({ overApp }: { overApp: boolean }) {
  const locale = useLocale()
  const now = useClock()
  return (
    <div className={`ios-status${overApp ? ' is-over-app' : ''}`}>
      <time dateTime={now.toISOString()}>{formatTime(now, locale)}</time>
      <span className="ios-status-icons" aria-hidden>
        <Signal size={16} />
        <Wifi size={16} />
        <BatteryFull size={20} />
      </span>
    </div>
  )
}

function LockScreen({ onUnlock }: { onUnlock(): void }) {
  const t = useT()
  const locale = useLocale()
  const now = useClock()
  const wallpaper = useWallpaper()
  const start = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [leaving, setLeaving] = useState(false)

  const leave = () => {
    setLeaving(true)
    window.setTimeout(onUnlock, 260)
  }

  const onPointerUp = () => {
    if (start.current === null) return
    start.current = null
    // A swipe up unlocks, and so does a plain tap; a half-hearted drag snaps back.
    if (offset > 90 || offset < 6) leave()
    else setOffset(0)
  }

  return (
    <div
      className={`ios-lock${leaving ? ' is-leaving' : ''}`}
      style={{ backgroundImage: wallpaper.css, transform: offset ? `translateY(${-offset}px)` : undefined }}
      role="button"
      tabIndex={0}
      aria-label={t('mobile.slide')}
      ref={(element) => element?.focus()}
      onPointerDown={(event) => {
        start.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (start.current !== null) setOffset(Math.max(0, start.current - event.clientY))
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null
        setOffset(0)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') leave()
      }}
    >
      <div className="ios-lock-shade">
        <Lock size={20} aria-hidden />
        <time className="ios-lock-time" dateTime={now.toISOString()}>
          <span>{formatDate(now, locale)}</span>
          <span>{formatTime(now, locale)}</span>
        </time>
        <p className="ios-lock-hint">{t('mobile.slide')}</p>
        <span className="ios-lock-bar" />
      </div>
    </div>
  )
}

interface HomeIcon {
  id: string
  label: string
  icon: Pick<AppDef, 'icon' | 'tint'>
  open(): void
}

function HomeScreen() {
  const t = useT()
  const os = useOS()
  const [page, setPage] = useState(0)

  const appIcon = (app: AppDef): HomeIcon => ({
    id: app.id,
    label: t(app.name),
    icon: app,
    open: () => os.open(app.id),
  })

  const icons: HomeIcon[] = [
    {
      id: 'resume',
      label: t(resumeShortcut.name),
      icon: resumeShortcut,
      open: () => os.open('viewer', { path: RESUME_PATH }),
    },
    // The résumé shortcut stands in for the Viewer; dock apps live in the dock.
    ...appList.filter((app) => app.id !== 'viewer' && !DOCK.includes(app.id)).map(appIcon),
  ]

  const pages: HomeIcon[][] = []
  for (let index = 0; index < icons.length; index += ICONS_PER_PAGE) {
    pages.push(icons.slice(index, index + ICONS_PER_PAGE))
  }

  const button = (icon: HomeIcon, withLabel: boolean) => (
    <button key={icon.id} className="ios-icon" onClick={icon.open} aria-label={icon.label}>
      <AppIcon app={icon.icon} size={60} />
      {withLabel && <span>{icon.label}</span>}
    </button>
  )

  return (
    <div className="ios-home">
      <div
        className="ios-pages"
        onScroll={(event) => {
          const { scrollLeft, clientWidth } = event.currentTarget
          setPage(Math.round(scrollLeft / clientWidth))
        }}
      >
        {pages.map((items, index) => (
          <div className="ios-page" key={index}>
            {items.map((icon) => button(icon, true))}
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="ios-dots" aria-hidden>
          {pages.map((_, index) => (
            <span key={index} className={index === page ? 'is-active' : ''} />
          ))}
        </div>
      )}

      <nav className="ios-dock">{DOCK.map((id) => button(appIcon(apps[id]), false))}</nav>
    </div>
  )
}

function AppScreen({
  screen,
  active,
  closing,
  onBack,
  onClose,
}: {
  screen: Screen
  active: boolean
  closing: boolean
  /** Present when there is a screen underneath to go back to. */
  onBack?: () => void
  onClose(): void
}) {
  const t = useT()
  const app = apps[screen.appId]
  const [title, setTitle] = useState<string | null>(null)
  const appWindow = useMemo<AppWindow>(() => ({ setTitle, close: onClose }), [onClose])
  const App = app.component

  return (
    <section
      className={`ios-app${closing ? ' is-closing' : ''}`}
      style={{ transformOrigin: `${screen.origin.x}px ${screen.origin.y}px` }}
      aria-hidden={!active}
    >
      <header className="ios-nav">
        {onBack && (
          <button className="ios-back" onClick={onBack}>
            <ChevronLeft size={22} />
            {t('common.back')}
          </button>
        )}
        <h1>{title ?? t(app.name)}</h1>
      </header>
      <div className="ios-app-body">
        <AppWindowContext.Provider value={appWindow}>
          <Suspense fallback={<div className="app-loading" />}>
            <App args={screen.args} />
          </Suspense>
        </AppWindowContext.Provider>
      </div>
    </section>
  )
}

/** The bar at the bottom of an open app: tap it or swipe it up to go home. */
function HomeBar({ onHome }: { onHome(): void }) {
  const t = useT()
  const start = useRef<number | null>(null)
  const swiped = useRef(false)

  const onPointerUp = (event: PointerEvent) => {
    swiped.current = start.current !== null && start.current - event.clientY > 24
    start.current = null
    if (swiped.current) onHome()
  }

  return (
    <button
      className="ios-homebar"
      aria-label={t('mobile.home')}
      onPointerDown={(event) => {
        start.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerUp={onPointerUp}
      onClick={() => {
        if (!swiped.current) onHome()
      }}
    >
      <span />
    </button>
  )
}
