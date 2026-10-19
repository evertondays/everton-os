import { useEffect, useRef } from 'react'
import { track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { useLocale, useT } from '../../i18n/index.ts'
import { appName, apps } from '../../system/apps.ts'
import { useStore } from '../../system/store.ts'
import { zoneRect } from './snap.ts'
import { endSnapAssist, snapWindow, windows } from './windows.ts'

/**
 * After a window snaps to one side, the free side lists the other open windows,
 * as Windows' Snap Assist does. Picking one snaps it there; clicking anywhere
 * else or pressing Escape dismisses the offer.
 */
export function SnapAssist() {
  const t = useT()
  const locale = useLocale()
  const assist = useStore(windows, (s) => s.assist)
  const list = useStore(windows, (s) => s.windows)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!assist) return
    const onMouseDown = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) endSnapAssist()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endSnapAssist()
    }
    // Capture: windows stop mousedown from bubbling out of them.
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [assist])

  const candidates = assist ? list.filter((win) => win.id !== assist.sourceId) : []
  if (!assist || candidates.length === 0) return null

  const rect = zoneRect(assist.side)
  return (
    <div
      className="snap-assist"
      ref={panel}
      role="dialog"
      aria-label={t('snap.assist')}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <p>{t('snap.assist')}</p>
      <div className="snap-assist-grid">
        {candidates.map((win) => (
          <button
            key={win.id}
            onClick={() => {
              track('snap_assist_used', { app: win.appId, side: assist.side, candidates: candidates.length })
              endSnapAssist()
              snapWindow(win.id, assist.side)
            }}
          >
            <AppIcon app={apps.get(win.appId)!} size={44} />
            <span>{win.title ?? appName(apps.get(win.appId)!, locale)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
