import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type AppSource, type FileSource, track } from '../analytics.ts'
import type { LaunchArgs, Shell } from '../sdk/app.ts'
import { type AppDef, appName, appsFor, appsIn } from './apps.ts'
import { appForScheme, appsForMime, defaultAppFor } from './associations.ts'
import { confirmDialog, showDialog } from './dialog.ts'
import { openFileDialog, saveFileDialog } from './fileDialog.ts'
import { type FsApi, fsApi, legacyFileType, publicPath, useFsVersion, vfs } from './fs.ts'
import { type Pid, type Process, getProcess, processes } from './processes.ts'
import { settings } from './settings.ts'
import { VfsError } from './vfs/errors.ts'
import { DIRECTORY_MIME, LAUNCHER_MIME, URL_MIME } from './vfs/mime.ts'
import type { Content } from './vfs/types.ts'
import { launcherApp } from './vfs/vfs.ts'

// What an app can ask of the system it runs in. Each shell (desktop, mobile)
// provides how apps run (exec, kill, their windows); the file system and how
// files open are the same in both. Apps reach all of it through src/sdk.

export type { Shell }

/** What a shell provides. */
export interface ShellOS {
  shell: Shell
  /** Runs an app and returns its process, or null if there's no such app. `source` is where the visitor launched it from. */
  exec(app: string, args: LaunchArgs, source: AppSource): Pid | null
  /** Asks a process to end; it may keep running if it has unsaved changes and the visitor says so. */
  kill(pid: Pid): void
}

/** An app as other apps see it: its name in the current language. */
export type AppInfo = Omit<AppDef, 'name' | 'entry' | 'load' | 'loaded'> & { name: string }

export interface OS extends ShellOS {
  fs: FsApi
  /** Opens a file with the app that handles its type, or with `with`; a symlink opens what it points to. Like xdg-open. */
  openFile(path: string, source: AppSource, options?: { with?: string }): Promise<void>
  /** Opens an address with the app for its scheme, or in a real tab. */
  openUrl(url: string, source: AppSource): void
  apps: {
    /** The apps this shell lists. */
    list(): AppInfo[]
    get(id: string): AppInfo | undefined
    /** The apps that open `mime`, the default first. */
    forMime(mime: string): AppInfo[]
  }
  /** The running processes. */
  ps(): Process[]
  dialog: {
    show: typeof showDialog
    confirm: typeof confirmDialog
    /** Asks for a file to open; resolves with its path, or null. */
    openFile: typeof openFileDialog
    /** Asks where to save; resolves with the chosen path (it may exist), or null. */
    saveFile: typeof saveFileDialog
  }
}

const info = (app: AppDef): AppInfo => {
  const { entry: _entry, load: _load, loaded: _loaded, ...rest } = app
  return { ...rest, name: appName(app, settings.get().locale) }
}

async function openFile(base: ShellOS, path: string, source: AppSource, options: { with?: string } = {}) {
  const link = vfs.lstat(path)
  // A symlink opens what it points to (and analytics see that path).
  const entry = link.inode.kind === 'symlink' ? vfs.stat(path) : link
  if (entry.inode.kind === 'dir') {
    // Files on the desktop, the Drive on the phone.
    base.exec(options.with ?? defaultAppFor(DIRECTORY_MIME, base.shell)?.id ?? 'files', { files: [entry.path] }, source)
    return
  }
  if (entry.mime === LAUNCHER_MIME && !options.with) {
    const content = await vfs.readFile(entry.path)
    const id = (typeof content === 'string' && content.trim()) || launcherApp(entry.name)
    if (!appsIn(base.shell).has(id)) throw new VfsError('ENOENT', id)
    base.exec(id, {}, source)
    return
  }
  const app = options.with ? appsIn(base.shell).get(options.with) : defaultAppFor(entry.mime, base.shell)
  if (!app) throw new VfsError('EINVAL', entry.displayName, 'noApp')
  track('file_opened', { path: publicPath(entry.path), file_type: legacyFileType(entry.mime), mime: entry.mime, source })
  if (options.with) track('file_opened_with', { app: app.id, mime: entry.mime })
  // A .url file holds an address: the browser gets the address.
  if (entry.mime === URL_MIME && app.handles?.schemes?.length) {
    const content = await vfs.readFile(entry.path)
    base.exec(app.id, { url: String(content).trim() }, source)
    return
  }
  base.exec(app.id, { files: [entry.path] }, source)
}

function openUrl(base: ShellOS, url: string, source: AppSource) {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] ?? 'https'
  const app = appForScheme(scheme, base.shell)
  if (app) base.exec(app.id, { url }, source)
  else window.open(url, '_blank', 'noopener')
}

export function buildOS(base: ShellOS, source: FileSource): OS {
  return {
    ...base,
    fs: fsApi(source),
    openFile: (path, from, options) => openFile(base, path, from, options),
    openUrl: (url, from) => openUrl(base, url, from),
    apps: {
      list: () => appsFor(base.shell).map(info),
      get: (id) => {
        const app = appsIn(base.shell).get(id)
        return app && info(app)
      },
      forMime: (mime) => appsForMime(mime, base.shell).map(info),
    },
    ps: () => processes.get().list,
    dialog: { show: showDialog, confirm: confirmDialog, openFile: openFileDialog, saveFile: saveFileDialog },
  }
}

export const OSContext = createContext<ShellOS | null>(null)

/** The process an app instance is; null outside apps (the desktop itself). */
export const ProcessContext = createContext<{ pid: Pid; appId: string } | null>(null)

/** Where file changes made by an app come from, for analytics. The Trash is Files. */
const fileSource = (appId: string): FileSource => (appId === 'trash' ? 'files' : appId)

export function useOS(): OS {
  const base = useContext(OSContext)
  if (!base) throw new Error('useOS must be used inside a shell')
  const process = useContext(ProcessContext)
  const source = process ? fileSource(process.appId) : 'desktop'
  return useMemo(() => buildOS(base, source), [base, source])
}

export type CloseGuard = () => boolean | Promise<boolean>

/** The window (desktop) or screen (mobile) an app instance is running in. */
export interface AppWindow {
  setTitle(title: string): void
  close(): void
  /**
   * While set, closing the window or screen asks `guard` first, and it stays
   * open if `guard` returns (or resolves to) false: unsaved changes, say,
   * asked about in a dialog. Null removes it.
   */
  setCloseGuard(guard: CloseGuard | null): void
}

export const AppWindowContext = createContext<AppWindow>({ setTitle() {}, close() {}, setCloseGuard() {} })

export const useAppWindow = () => useContext(AppWindowContext)

/**
 * Calls `callback` with the new arguments each time this single-instance app
 * is opened again (a file opened with it, say) while it's already running.
 */
export function useLaunchArgs(callback: (args: LaunchArgs) => void) {
  const process = useContext(ProcessContext)
  const latest = useRef(callback)
  const pid = process?.pid

  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    if (pid === undefined) return
    let seen = getProcess(pid)?.launches ?? 0
    return processes.subscribe(() => {
      const current = getProcess(pid)
      if (!current || current.launches === seen) return
      seen = current.launches
      latest.current(current.args)
    })
  }, [pid])
}

/** Object URLs of the Blobs on screen, and how many components show each. */
const objectUrls = new Map<Blob, { url: string; users: number }>()

function objectUrlFor(blob: Blob): string {
  let entry = objectUrls.get(blob)
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), users: 0 }
    objectUrls.set(blob, entry)
  }
  return entry.url
}

function retain(blob: Blob) {
  const entry = objectUrls.get(blob)
  if (entry) entry.users++
}

/** Revokes a Blob's URL once nothing shows it, a moment later, so a component that mounts again (StrictMode) keeps it. */
function release(blob: Blob) {
  const entry = objectUrls.get(blob)
  if (!entry) return
  entry.users--
  window.setTimeout(() => {
    if (entry.users > 0 || objectUrls.get(blob) !== entry) return
    URL.revokeObjectURL(entry.url)
    objectUrls.delete(blob)
  })
}

/**
 * A URL to show `content` with: an object URL for a Blob, revoked once no
 * component shows it anymore; else its address.
 */
export function useObjectUrl(content: Content | undefined): string | undefined {
  const blob = content instanceof Blob ? content : null
  const url = blob ? objectUrlFor(blob) : undefined

  useEffect(() => {
    if (!blob) return
    retain(blob)
    return () => release(blob)
  }, [blob])

  return content instanceof URL ? content.href : url
}

/**
 * The content of the file at `path`, read again whenever the file system
 * changes. While a read is on its way, the last content stays (`loading`).
 */
export function useFileContent(path: string | null): { content?: Content; error?: unknown; loading: boolean } {
  const version = useFsVersion()
  const key = path === null ? null : `${version}:${path}`
  const [state, setState] = useState<{ key: string | null; content?: Content; error?: unknown }>({ key: null })

  useEffect(() => {
    if (path === null) return
    let live = true
    vfs.readFile(path).then(
      (content) => live && setState({ key, content }),
      (error: unknown) => live && setState({ key, error }),
    )
    return () => {
      live = false
    }
  }, [key, path])

  return { content: state.content, error: state.error, loading: state.key !== key }
}
