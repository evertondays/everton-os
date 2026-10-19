import { type AppSource, track } from '../../analytics.ts'
import type { LaunchArgs } from '../../sdk/app.ts'
import { type AppId, apps } from '../../system/apps.ts'
import { publicArgs } from '../../system/fs.ts'
import { type Pid, exit, hasArgs, relaunch, spawn } from '../../system/processes.ts'
import { createStore } from '../../system/store.ts'
import type { SnapSide, SnapZone } from './snap.ts'
import type { WindowHandle } from './useWindow.ts'

// The list of open windows. React renders one <Window> per entry; the entries
// mirror what WinBox reports (focus, minimize) so the panel can show it. Each
// window is a process (system/processes.ts).

export interface Win {
  id: string
  pid: Pid
  appId: AppId
  args: LaunchArgs
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
  /** Set right after a window snaps to one side: the other windows are offered for the other side. */
  assist: { side: SnapSide; sourceId: string } | null
}

const empty: State = { windows: [], focusedId: null, recent: [], assist: null }

export const windows = createStore<State>(empty)

interface Registered {
  handle(): WindowHandle | null
  /** Closes the window as its close button does: asking the app first. */
  close(): void
}

const registered = new Map<string, Registered>()
let sequence = 0

const update = (id: string, patch: Partial<Win>) =>
  windows.set((state) => ({
    windows: state.windows.map((win) => (win.id === id ? { ...win, ...patch } : win)),
  }))

/**
 * Opens a window for `appId`, or brings back the one there is: a
 * single-instance app's (which gets the new arguments), or one already
 * showing the same file.
 */
export function openWindow(appId: AppId, args: LaunchArgs, source: AppSource): Pid | null {
  const app = apps.get(appId)
  if (!app) return null
  const file = args.files?.[0]
  const existing = windows
    .get()
    .windows.find((win) => win.appId === appId && (app.single || (file !== undefined && win.args.files?.[0] === file)))
  track('app_opened', { app: appId, source, ...publicArgs(args), already_open: existing !== undefined })
  if (existing) {
    if (app.single && hasArgs(args)) relaunch(existing.pid, args)
    activateWindow(existing.id)
    return existing.pid
  }
  const slot = ++sequence
  const { pid } = spawn(appId, args)
  windows.set((state) => ({
    windows: [...state.windows, { id: `window-${slot}`, pid, appId, args, title: null, minimized: false, slot }],
  }))
  return pid
}

export function closeWindow(id: string) {
  const win = windows.get().windows.find((other) => other.id === id)
  if (win) {
    track('app_closed', { app: win.appId, method: 'window' })
    exit(win.pid)
  }
  windows.set((state) => ({
    windows: state.windows.filter((win) => win.id !== id),
    recent: state.recent.filter((other) => other !== id),
    focusedId: state.focusedId === id ? null : state.focusedId,
    assist: state.assist?.sourceId === id ? null : state.assist,
  }))
}

/** Closes the window of process `pid`, asking its app first (`kill` in the Terminal). */
export function killWindow(pid: Pid) {
  const win = windows.get().windows.find((other) => other.pid === pid)
  if (win) registered.get(win.id)?.close()
}

/** Offers the other open windows for `side`, after `sourceId` snapped to the opposite one. */
export function startSnapAssist(sourceId: string, side: SnapSide) {
  if (windows.get().windows.some((win) => win.id !== sourceId)) windows.set({ assist: { side, sourceId } })
}

export function endSnapAssist() {
  if (windows.get().assist) windows.set({ assist: null })
}

/** Snaps a window into a zone and brings it to the front. */
export function snapWindow(id: string, zone: SnapZone) {
  const handle = registered.get(id)?.handle()
  handle?.snap(zone)
  handle?.focus()
}

export function closeAllWindows() {
  windows.get().windows.forEach((win) => exit(win.pid))
  windows.set(empty)
}

/** Restores the window if needed and brings it to the front. */
export function activateWindow(id: string) {
  const handle = registered.get(id)?.handle()
  handle?.restore()
  handle?.focus()
}

export function minimizeWindow(id: string) {
  registered.get(id)?.handle()?.minimize()
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

export function registerWindow(id: string, window: Registered) {
  registered.set(id, window)
  return () => {
    registered.delete(id)
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
