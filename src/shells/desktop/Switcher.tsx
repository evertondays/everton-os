import { useEffect, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { useLocale } from '../../i18n/index.ts'
import { appName, apps } from '../../system/apps.ts'
import { useStore } from '../../system/store.ts'
import { activateWindow, windows, windowsByRecency } from './windows.ts'

/**
 * Alt+Tab. Browsers on most systems never see that combination (the host OS
 * takes it) unless the page is in full screen with the keyboard locked, so
 * Alt+` does the same thing everywhere.
 */
export function Switcher() {
  const locale = useLocale()
  const [index, setIndex] = useState<number | null>(null)
  // The key handlers need the current value synchronously.
  const current = useRef<number | null>(null)
  useStore(windows, (s) => s.windows)

  useEffect(() => {
    const select = (value: number | null) => {
      current.current = value
      setIndex(value)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== 'Tab' && event.key !== '`')) return
      event.preventDefault()
      const count = windowsByRecency().length
      if (count === 0) return
      const step = event.shiftKey ? count - 1 : 1
      select(current.current === null ? Math.min(1, count - 1) : (current.current + step) % count)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || current.current === null) return
      const list = windowsByRecency()
      const win = list[current.current]
      select(null)
      if (!win) return
      track('window_switcher_used', { app: win.appId, open_windows: list.length })
      activateWindow(win.id)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  if (index === null) return null
  return (
    <div className="switcher" role="listbox">
      {windowsByRecency().map((win, position) => (
        <div
          key={win.id}
          className={`switcher-item${position === index ? ' is-selected' : ''}`}
          role="option"
          aria-selected={position === index}
        >
          <AppIcon app={apps.get(win.appId)!} size={56} />
          <span>{win.title ?? appName(apps.get(win.appId)!, locale)}</span>
        </div>
      ))}
    </div>
  )
}
