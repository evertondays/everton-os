import { createContext, useContext } from 'react'
import { type AppSource, track } from '../analytics.ts'
import type { AppArgs, AppId } from './apps.ts'
import { type FsNode, chainPath, getFs, publicPath, shortcutTarget } from './fs.ts'
import { settings } from './settings.ts'

// What an app can ask of the system it runs in. Each shell (desktop, mobile)
// provides its own implementation, so the apps never know which one they're in
// beyond `shell`.

export type Shell = 'desktop' | 'mobile'

export interface OS {
  shell: Shell
  /** `source` is where the visitor launched it from, for analytics. */
  open(app: AppId, source: AppSource, args?: AppArgs): void
}

export const OSContext = createContext<OS | null>(null)

export function useOS(): OS {
  const os = useContext(OSContext)
  if (!os) throw new Error('useOS must be used inside a shell')
  return os
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

/** Opens a file system node with the app that handles it. */
export function openNode(os: OS, node: FsNode, path: string, source: 'files' | 'terminal' | 'desktop_icon') {
  if (node.kind === 'dir') {
    os.open('files', source, { path })
    return
  }
  // A shortcut opens what it points to, from whatever folder it's in.
  if (node.type === 'shortcut') {
    const target = shortcutTarget(getFs(settings.get().locale), node)
    if (target && 'app' in target) os.open(target.app, source)
    else if (target) openNode(os, target.chain.at(-1)!, chainPath(target.chain), source)
    return
  }
  track('file_opened', { path: publicPath(path), file_type: node.type, source })
  if (node.type === 'link') os.open('browser', source, { url: node.url })
  else if (node.type === 'text') os.open('editor', source, { path })
  else os.open('viewer', source, { path })
}
