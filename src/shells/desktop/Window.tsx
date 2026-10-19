import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../../analytics.ts'
import { useLocale } from '../../i18n/index.ts'
import { appName, apps } from '../../system/apps.ts'
import { type AppWindow, AppWindowContext, type CloseGuard, ProcessContext } from '../../system/os.ts'
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
  const app = apps.get(win.appId)!
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

/**
 * Closes window `id` unless its app's close guard keeps it open. While the
 * guard is asking (a dialog), more close clicks are ignored.
 */
async function guardedClose(id: string, guard: RefObject<CloseGuard | null>, asking: RefObject<boolean>) {
  if (asking.current) return
  asking.current = true
  try {
    if (guard.current && !(await guard.current())) return
  } finally {
    asking.current = false
  }
  closeWindow(id)
}

export function Window({ win }: { win: Win }) {
  const locale = useLocale()
  const app = apps.get(win.appId)!
  const { id, pid, appId } = win
  const closeGuard = useRef<CloseGuard | null>(null)
  const asking = useRef(false)

  const { container, handle } = useWindow({
    title: win.title ?? appName(app, locale),
    ...placement(win),
    bottom: PANEL_HEIGHT,
    onClose: () => void guardedClose(id, closeGuard, asking),
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

  useEffect(
    () =>
      registerWindow(id, {
        handle: () => handle.current,
        close: () => void guardedClose(id, closeGuard, asking),
      }),
    [id, handle],
  )

  const appWindow = useMemo<AppWindow>(
    () => ({
      setTitle: (title) => setWindowTitle(id, title),
      close: () => void guardedClose(id, closeGuard, asking),
      setCloseGuard: (guard) => {
        closeGuard.current = guard
      },
    }),
    [id],
  )
  const process = useMemo(() => ({ pid, appId }), [pid, appId])

  if (!container) return null
  const App = app.component
  return createPortal(
    <ProcessContext.Provider value={process}>
      <AppWindowContext.Provider value={appWindow}>
        <Suspense fallback={<div className="app-loading" />}>
          <App args={win.args} />
        </Suspense>
      </AppWindowContext.Provider>
    </ProcessContext.Provider>,
    container,
  )
}
