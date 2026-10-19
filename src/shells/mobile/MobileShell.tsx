import { BatteryFull, ChevronLeft, Lock, Signal, Wifi } from 'lucide-react'
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AppSource, track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { posthogLog } from '../../posthog-logs.ts'
import { useLocale, useT } from '../../i18n/index.ts'
import type { LaunchArgs } from '../../sdk/app.ts'
import { type AppDef, type AppId, appName, apps, appsFor, preloadApps } from '../../system/apps.ts'
import { type Tile, tiles } from '../../system/fileUi.ts'
import { formatDate, formatTime } from '../../system/format.ts'
import { RESUME_PATH, publicArgs, useFsReady } from '../../system/fs.ts'
import {
  type AppWindow,
  AppWindowContext,
  type CloseGuard,
  OSContext,
  ProcessContext,
  type ShellOS,
  useOS,
} from '../../system/os.ts'
import { type Pid, exit, hasArgs, relaunch, spawn } from '../../system/processes.ts'
import { settings } from '../../system/settings.ts'
import { useClock } from '../../system/useClock.ts'
import { useWallpaper } from '../../system/wallpapers.ts'
import { AppContent } from '../AppContent.tsx'
import './mobile.css'

// The phone shell: lock screen, home screen with a dock, and apps in full
// screen. The apps are the same components the desktop puts in windows.

const DOCK: AppId[] = ['contact', 'browser', 'gallery', 'files']
const ICONS_PER_PAGE = 20
const CLOSE_ANIMATION = 220

interface Screen {
  /** The process it runs. */
  key: Pid
  appId: AppId
  args: LaunchArgs
  /** Where the tap that opened it landed; the app zooms in from there. */
  origin: { x: number; y: number }
}

/** Asks the close guards of `list`, top screen first, one at a time; false as soon as one wants to stay. */
async function mayLeave(guards: Map<number, CloseGuard>, list: Screen[]) {
  for (const screen of list.toReversed()) {
    const guard = guards.get(screen.key)
    if (guard && !(await guard())) return false
  }
  return true
}

export default function MobileShell() {
  const wallpaper = useWallpaper()
  const [locked, setLocked] = useState(true)
  // Apps can open other apps (Files opens the Viewer), so screens stack.
  const [screens, setScreens] = useState<Screen[]>([])
  const [closing, setClosing] = useState(false)
  const lastTap = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const firstVisit = useRef(!settings.get().visited)
  // The visitor's files load while the lock screen is up; apps only show once they're there.
  const ready = useFsReady()

  // The callbacks below need the app on top without being rebuilt on every change.
  const top = useRef<Screen | undefined>(undefined)
  const stack = useRef<Screen[]>([])
  // Set by apps that don't want to be left yet (AppWindow.setCloseGuard), by screen key.
  const [guards] = useState(() => new Map<number, CloseGuard>())
  // Set while a guard is asking, so more taps on Back or Home don't stack up dialogs.
  const asking = useRef(false)

  useEffect(() => {
    top.current = screens.at(-1)
    stack.current = screens
  })

  // While the lock screen is up, the apps load in the background, so they open at once.
  useEffect(() => preloadApps('mobile'), [])

  /** Runs `leave` if the guards of `list` let it; one question at a time. */
  const leaveIfAllowed = useCallback(
    async (list: Screen[], leave: () => void) => {
      if (asking.current) return
      asking.current = true
      try {
        if (!(await mayLeave(guards, list))) return
      } finally {
        asking.current = false
      }
      leave()
    },
    [guards],
  )

  /**
   * Opens an app on top. A single-instance app that's already open comes back
   * to the top instead, with the new arguments.
   */
  const open = useCallback((appId: AppId, args: LaunchArgs, source: AppSource): Pid | null => {
    const app = apps.get(appId)
    if (!app) return null
    const existing = app.single ? stack.current.find((screen) => screen.appId === appId) : undefined
    track('app_opened', { app: appId, source, ...publicArgs(args), already_open: existing !== undefined })
    if (existing) {
      if (hasArgs(args)) relaunch(existing.key, args)
      setScreens((list) => [...list.filter((screen) => screen.key !== existing.key), existing])
      return existing.key
    }
    const { pid } = spawn(appId, args)
    const screen: Screen = { key: pid, appId, args, origin: lastTap.current }
    setScreens((list) => [...list, screen])
    return pid
  }, [])

  /** Closes the screen of process `pid` (`kill` in the Terminal), if its app lets it. */
  const kill = useCallback(
    (pid: Pid) => {
      const screen = stack.current.find((other) => other.key === pid)
      if (!screen) return
      void leaveIfAllowed([screen], () => {
        exit(pid)
        setScreens((list) => list.filter((other) => other.key !== pid))
      })
    },
    [leaveIfAllowed],
  )

  const os = useMemo<ShellOS>(() => ({ shell: 'mobile', exec: open, kill }), [open, kill])

  const back = useCallback(() => {
    const screen = top.current
    void leaveIfAllowed(screen ? [screen] : [], () => {
      if (screen) {
        track('app_closed', { app: screen.appId, method: 'back' })
        exit(screen.key)
      }
      setScreens((list) => list.slice(0, -1))
    })
  }, [leaveIfAllowed])

  const goHome = useCallback(() => {
    const screen = top.current
    void leaveIfAllowed(stack.current, () => {
      if (screen) track('app_closed', { app: screen.appId, method: 'home' })
      setClosing(true)
      window.setTimeout(() => {
        stack.current.forEach((other) => exit(other.key))
        setScreens([])
        setClosing(false)
      }, CLOSE_ANIMATION)
    })
  }, [leaveIfAllowed])

  const unlock = useCallback(() => {
    setLocked(false)
    // A first-time visitor is greeted with the About me app.
    if (firstVisit.current) {
      firstVisit.current = false
      open('about', {}, 'first_visit')
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
        {ready &&
          screens.map((screen, index) => (
            <AppScreen
              key={screen.key}
              screen={screen}
              active={index === screens.length - 1}
              closing={closing}
              onBack={index > 0 ? back : undefined}
              onClose={index > 0 ? back : goHome}
              guards={guards}
            />
          ))}
        {ready && screens.length > 0 && <HomeBar onHome={goHome} />}
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
    if (leaving) return
    track('portfolio_entered', { entry_point: 'mobile_lock_screen' })
    posthogLog.portfolioEntered('mobile_lock_screen')
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
  icon: Tile
  open(): void
}

function HomeScreen() {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const [page, setPage] = useState(0)

  const appIcon = (app: AppDef, source: AppSource): HomeIcon => ({
    id: app.id,
    label: appName(app, locale),
    icon: app,
    open: () => os.exec(app.id, {}, source),
  })

  const icons: HomeIcon[] = [
    {
      id: 'resume',
      label: t('app.resume'),
      icon: tiles.resume,
      open: () => os.exec('viewer', { files: [RESUME_PATH] }, 'home_screen'),
    },
    // The résumé shortcut stands in for the Viewer; dock apps live in the dock.
    ...appsFor('mobile')
      .filter((app) => app.id !== 'viewer' && !DOCK.includes(app.id))
      .map((app) => appIcon(app, 'home_screen')),
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

      <nav className="ios-dock">
        {DOCK.flatMap((id) => {
          const app = apps.get(id)
          return app ? [button(appIcon(app, 'dock'), false)] : []
        })}
      </nav>
    </div>
  )
}

function AppScreen({
  screen,
  active,
  closing,
  onBack,
  onClose,
  guards,
}: {
  screen: Screen
  active: boolean
  closing: boolean
  /** Present when there is a screen underneath to go back to. */
  onBack?: () => void
  onClose(): void
  guards: Map<number, CloseGuard>
}) {
  const t = useT()
  const locale = useLocale()
  const app = apps.get(screen.appId)!
  const [title, setTitle] = useState<string | null>(null)
  const { key, appId } = screen
  const appWindow = useMemo<AppWindow>(
    () => ({
      setTitle,
      close: onClose,
      setCloseGuard: (guard) => {
        if (guard) guards.set(key, guard)
        else guards.delete(key)
      },
    }),
    [onClose, guards, key],
  )
  const process = useMemo(() => ({ pid: key, appId }), [key, appId])

  useEffect(() => () => void guards.delete(key), [guards, key])

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
        <h1>{title ?? appName(app, locale)}</h1>
      </header>
      <div className="ios-app-body">
        <ProcessContext.Provider value={process}>
          <AppWindowContext.Provider value={appWindow}>
            <AppContent app={app} args={screen.args} />
          </AppWindowContext.Provider>
        </ProcessContext.Provider>
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
