import { createContext, useContext } from 'react'
import type { AppArgs, AppId } from './apps.ts'
import type { FsNode } from './fs.ts'

// What an app can ask of the system it runs in. Each shell (desktop, mobile)
// provides its own implementation, so the apps never know which one they're in
// beyond `shell`.

export type Shell = 'desktop' | 'mobile'

export interface OS {
  shell: Shell
  open(app: AppId, args?: AppArgs): void
}

export const OSContext = createContext<OS | null>(null)

export function useOS(): OS {
  const os = useContext(OSContext)
  if (!os) throw new Error('useOS must be used inside a shell')
  return os
}

/** The window (desktop) or screen (mobile) an app instance is running in. */
export interface AppWindow {
  setTitle(title: string): void
  close(): void
}

export const AppWindowContext = createContext<AppWindow>({ setTitle() {}, close() {} })

export const useAppWindow = () => useContext(AppWindowContext)

/** Opens a file system node with the app that handles it. */
export function openNode(os: OS, node: FsNode, path: string) {
  if (node.kind === 'dir') os.open('files', { path })
  else if (node.type === 'link') os.open('browser', { url: node.url })
  else os.open('viewer', { path })
}
