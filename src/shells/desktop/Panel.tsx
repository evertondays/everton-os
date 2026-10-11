import { Maximize, Moon, Sun, Volume2, Wifi } from 'lucide-react'
import { useRef } from 'react'
import { AppIcon } from '../../components/AppIcon.tsx'
import { Logo } from '../../components/Logo.tsx'
import { useLocale, useT } from '../../i18n/index.ts'
import { apps, resumeShortcut } from '../../system/apps.ts'
import { formatDate, formatTime } from '../../system/format.ts'
import { RESUME_PATH } from '../../system/fs.ts'
import { useOS } from '../../system/os.ts'
import { settings, useSettings } from '../../system/settings.ts'
import { useStore } from '../../system/store.ts'
import { useClock } from '../../system/useClock.ts'
import { activateWindow, minimizeWindow, windows } from './windows.ts'

type KeyboardLock = { keyboard?: { lock?(keys: string[]): Promise<void> } }

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  await document.documentElement.requestFullscreen()
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

export function Panel({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu(): void }) {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const now = useClock()
  const theme = useSettings((s) => s.theme)
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
        onClick={() => os.open('viewer', { path: RESUME_PATH })}
        title={t('app.resume')}
        aria-label={t('app.resume')}
      >
        <AppIcon app={resumeShortcut} size={28} />
      </button>

      <span className="panel-separator" />

      <div className="panel-tasks">
        {list.map((win) => {
          const title = win.title ?? t(apps[win.appId].name)
          const focused = win.id === focusedId
          return (
            <button
              key={win.id}
              className={`panel-task${focused ? ' is-focused' : ''}${win.minimized ? ' is-minimized' : ''}`}
              onMouseDown={() => {
                pressedFocused.current = focused
              }}
              onClick={() => (pressedFocused.current ? minimizeWindow(win.id) : activateWindow(win.id))}
              title={title}
            >
              <AppIcon app={apps[win.appId]} size={24} />
              <span>{title}</span>
            </button>
          )
        })}
      </div>

      <div className="panel-tray">
        <button
          className="panel-button panel-locale"
          onClick={() => settings.set({ locale: locale === 'pt' ? 'en' : 'pt' })}
          title={t('panel.language')}
          aria-label={t('panel.language')}
        >
          {locale.toUpperCase()}
        </button>
        <button
          className="panel-button"
          onClick={() => settings.set({ theme: theme === 'dark' ? 'light' : 'dark' })}
          title={t('panel.theme')}
          aria-label={t('panel.theme')}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="panel-button"
          onClick={() => void toggleFullscreen()}
          title={t('panel.fullscreen')}
          aria-label={t('panel.fullscreen')}
        >
          <Maximize size={16} />
        </button>
        <span className="panel-status" aria-hidden>
          <Wifi size={16} />
          <Volume2 size={16} />
        </span>
        <time className="panel-clock" dateTime={now.toISOString()}>
          <span>{formatTime(now, locale)}</span>
          <span>{formatDate(now, locale, 'short')}</span>
        </time>
      </div>
    </footer>
  )
}
