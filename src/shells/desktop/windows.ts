import { type AppSource, track } from '../../analytics.ts'
import { type AppArgs, type AppId, apps } from '../../system/apps.ts'
import { createStore } from '../../system/store.ts'
import type { WindowHandle } from './useWindow.ts'

// The list of open windows. React renders one <Window> per entry; the entries
// mirror what WinBox reports (focus, minimize) so the panel can show it.

export interface Win {
  id: string
  appId: AppId
  args?: AppArgs
  /** Set by the app (a file name, a page title); null shows the app name. */
  title: string | null
  minimized: boolean
  /** Opening order, used to cascade new windows. */
  slot: number
}

interface State {
  windows: Win[]
  focusedId: string | null
  /** Window ids, most recently focused first. */
  recent: string[]
}

const empty: State = { windows: [], focusedId: null, recent: [] }

export const windows = createStore<State>(empty)

const handles = new Map<string, () => WindowHandle | null>()
let sequence = 0

const update = (id: string, patch: Partial<Win>) =>
  windows.set((state) => ({
    windows: state.windows.map((win) => (win.id === id ? { ...win, ...patch } : win)),
  }))

export function openWindow(appId: AppId, source: AppSource, args?: AppArgs) {
  const existing = windows
    .get()
    .windows.find(
      (win) => win.appId === appId && (apps[appId].single || (args?.path !== undefined && win.args?.path === args.path)),
    )
  track('app_opened', { app: appId, source, ...args, already_open: existing !== undefined })
  if (existing) {
    activateWindow(existing.id)
    return
  }
  const slot = ++sequence
  windows.set((state) => ({
    windows: [...state.windows, { id: `window-${slot}`, appId, args, title: null, minimized: false, slot }],
  }))
}

export function closeWindow(id: string) {
  const win = windows.get().windows.find((other) => other.id === id)
  if (win) track('app_closed', { app: win.appId, method: 'window' })
  windows.set((state) => ({
    windows: state.windows.filter((win) => win.id !== id),
    recent: state.recent.filter((other) => other !== id),
    focusedId: state.focusedId === id ? null : state.focusedId,
  }))
}

export function closeAllWindows() {
  windows.set(empty)
}

/** Restores the window if needed and brings it to the front. */
export function activateWindow(id: string) {
  const handle = handles.get(id)?.()
  handle?.restore()
  handle?.focus()
}

export function minimizeWindow(id: string) {
  handles.get(id)?.()?.minimize()
}

export function setWindowTitle(id: string, title: string) {
  update(id, { title })
}

/** Open windows, most recently focused first. */
export function windowsByRecency(): Win[] {
  const { windows: list, recent } = windows.get()
  const rank = (win: Win) => {
    const index = recent.indexOf(win.id)
    return index === -1 ? recent.length : index
  }
  return [...list].sort((a, b) => rank(a) - rank(b))
}

// Called by <Window> to report what its WinBox instance is doing.

export function registerWindow(id: string, handle: () => WindowHandle | null) {
  handles.set(id, handle)
  return () => {
    handles.delete(id)
  }
}

export function windowFocused(id: string) {
  windows.set((state) => ({ focusedId: id, recent: [id, ...state.recent.filter((other) => other !== id)] }))
}

export function windowBlurred(id: string) {
  windows.set((state) => (state.focusedId === id ? { focusedId: null } : {}))
}

export function windowMinimized(id: string, minimized: boolean) {
  const win = windows.get().windows.find((other) => other.id === id)
  // WinBox also reports a restore when a maximized window shrinks back.
  if (win && win.minimized !== minimized) {
    track(minimized ? 'window_minimized' : 'window_restored', { app: win.appId })
  }
  update(id, { minimized })
}
