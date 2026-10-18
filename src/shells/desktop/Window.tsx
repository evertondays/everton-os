import { Suspense, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../../analytics.ts'
import { useT } from '../../i18n/index.ts'
import { apps } from '../../system/apps.ts'
import { type AppWindow, AppWindowContext } from '../../system/os.ts'
import { PANEL_HEIGHT, workArea } from './layout.ts'
import { isSide, oppositeSide } from './snap.ts'
import { useWindow } from './useWindow.ts'
import {
  type Win,
  closeWindow,
  registerWindow,
  setWindowTitle,
  startSnapAssist,
  windowBlurred,
  windowFocused,
  windowMinimized,
} from './windows.ts'

/** Size and position for a new window: the app's default, cascaded and kept on screen. */
function placement(win: Win) {
  const app = apps[win.appId]
  const { width: screenWidth, height: screenHeight } = workArea()
  const width = Math.min(app.width, screenWidth - 32)
  const height = Math.min(app.height, screenHeight - 32)
  const step = (win.slot - 1) % 6
  return {
    width,
    height,
    x: Math.max(16, Math.min((screenWidth - width) / 2 - 90 + step * 36, screenWidth - width - 16)),
    y: Math.max(16, Math.min((screenHeight - height) / 2 - 75 + step * 30, screenHeight - height - 16)),
  }
}

export function Window({ win }: { win: Win }) {
  const t = useT()
  const app = apps[win.appId]
  const { id } = win
  const closeGuard = useRef<(() => boolean) | null>(null)

  const { container, handle } = useWindow({
    title: win.title ?? t(app.name),
    ...placement(win),
    bottom: PANEL_HEIGHT,
    onClose: () => {
      if (!closeGuard.current || closeGuard.current()) closeWindow(id)
    },
    onFocus: () => windowFocused(id),
    onBlur: () => windowBlurred(id),
    onMinimize: () => windowMinimized(id, true),
    onRestore: () => windowMinimized(id, false),
    // Snapped to one side: offer the other windows for the other side, like Windows' Snap Assist.
    onSnap: (zone) => {
      track('window_snapped', { app: win.appId, zone })
      if (isSide(zone)) startSnapAssist(id, oppositeSide(zone))
    },
  })

  useEffect(() => registerWindow(id, () => handle.current), [id, handle])

  const appWindow = useMemo<AppWindow>(
    () => ({
      setTitle: (title) => setWindowTitle(id, title),
      close: () => {
        if (!closeGuard.current || closeGuard.current()) closeWindow(id)
      },
      setCloseGuard: (guard) => {
        closeGuard.current = guard
      },
    }),
    [id],
  )

  if (!container) return null
  const App = app.component
  return createPortal(
    <AppWindowContext.Provider value={appWindow}>
      <Suspense fallback={<div className="app-loading" />}>
        <App args={win.args} />
      </Suspense>
    </AppWindowContext.Provider>,
    container,
  )
}
