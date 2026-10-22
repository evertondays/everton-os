import { Maximize, Minimize, Moon, Sun, Volume2, Wifi } from 'lucide-react'
import { useRef, useSyncExternalStore } from 'react'
import { track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { Logo } from '../../components/Logo.tsx'
import { useLocale, useT } from '../../i18n/index.ts'
import { appName, apps } from '../../system/apps.ts'
import { tiles } from '../../system/fileUi.ts'
import { formatDate, formatTime } from '../../system/format.ts'
import { RESUME_PATH } from '../../system/fs.ts'
import { useOS } from '../../system/os.ts'
import { setLocale, setTheme, useSettings } from '../../system/settings.ts'
import { useStore } from '../../system/store.ts'
import { useClock } from '../../system/useClock.ts'
import { activateWindow, minimizeWindow, windows } from './windows.ts'

type KeyboardLock = { keyboard?: { lock?(keys: string[]): Promise<void> } }

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    track('fullscreen_toggled', { fullscreen: false })
    return
  }
  await document.documentElement.requestFullscreen()
  track('fullscreen_toggled', { fullscreen: true })
  // In full screen, Chromium can hand us the keys the host OS normally keeps,
  // so Alt+Tab and Super work like on a real desktop.
  await (navigator as Navigator & KeyboardLock).keyboard?.lock?.([
    'AltLeft',
    'AltRight',
    'Tab',
    'MetaLeft',
    'MetaRight',
  ])
}

// Follows the browser's full screen, so Esc (or F11's exit) also flips the icon.
function useFullscreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('fullscreenchange', onChange)
      return () => document.removeEventListener('fullscreenchange', onChange)
    },
    () => document.fullscreenElement !== null,
  )
}

export function Panel({
  menuOpen,
  onToggleMenu,
  calendarOpen,
  onToggleCalendar,
}: {
  menuOpen: boolean
  onToggleMenu(): void
  calendarOpen: boolean
  onToggleCalendar(): void
}) {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const now = useClock()
  const theme = useSettings((s) => s.theme)
  const fullscreen = useFullscreen()
  const list = useStore(windows, (s) => s.windows)
  const focusedId = useStore(windows, (s) => s.focusedId)
  // WinBox blurs the focused window as soon as the mouse goes down outside it,
  // so "was this window focused?" has to be answered on mousedown, not on click.
  const pressedFocused = useRef(false)

  return (
    <footer className="panel">
      <button
        className={`panel-button panel-menu${menuOpen ? ' is-active' : ''}`}
        data-menu-button
        onClick={onToggleMenu}
        aria-label={t('panel.menu')}
        aria-expanded={menuOpen}
        title={t('panel.menu')}
      >
        <Logo size={26} />
      </button>

      <button
        className="panel-button"
        onClick={() => os.exec('viewer', { files: [RESUME_PATH] }, 'panel')}
        title={t('app.resume')}
        aria-label={t('app.resume')}
      >
        <AppIcon app={tiles.resume} size={28} />
      </button>

      <span className="panel-separator" />

      <div className="panel-tasks">
        {list.map((win) => {
          const app = apps.get(win.appId)!
          const title = win.title ?? appName(app, locale)
          const focused = win.id === focusedId
          return (
            <button
              key={win.id}
              // Where the window minimizes to (useWindow's dock).
              data-window-id={win.id}
              className={`panel-task${focused ? ' is-focused' : ''}${win.minimized ? ' is-minimized' : ''}`}
              onMouseDown={() => {
                pressedFocused.current = focused
              }}
              onClick={() => {
                const action = pressedFocused.current ? 'minimize' : 'activate'
                track('taskbar_item_clicked', { app: win.appId, action })
                if (action === 'minimize') minimizeWindow(win.id)
                else activateWindow(win.id)
              }}
              title={title}
            >
              <AppIcon app={app} size={24} />
              <span>{title}</span>
            </button>
          )
        })}
      </div>

      <div className="panel-tray">
        <button
          className="panel-button panel-locale"
          onClick={() => setLocale(locale === 'pt' ? 'en' : 'pt', 'panel')}
          title={t('panel.language')}
          aria-label={t('panel.language')}
        >
          {locale.toUpperCase()}
        </button>
        <button
          className="panel-button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark', 'panel')}
          title={t('panel.theme')}
          aria-label={t('panel.theme')}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="panel-button"
          onClick={() => void toggleFullscreen()}
          title={t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen')}
          aria-label={t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen')}
        >
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <span className="panel-status" aria-hidden>
          <Wifi size={16} />
          <Volume2 size={16} />
        </span>
        <button
          className={`panel-button panel-clock${calendarOpen ? ' is-active' : ''}`}
          data-clock-button
          onClick={onToggleCalendar}
          aria-expanded={calendarOpen}
          aria-label={t('calendar.open')}
          title={formatDate(now, locale)}
        >
          <time dateTime={now.toISOString()}>
            <span>{formatTime(now, locale)}</span>
            <span>{formatDate(now, locale, 'short')}</span>
          </time>
        </button>
      </div>
    </footer>
  )
}
