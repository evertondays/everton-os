import type { TKey } from '../i18n/dict.ts'
import type { AppId } from './apps.ts'
import { createStore } from './store.ts'

// The visitor's own files and folders. They live in this browser only and are
// laid over the résumé tree by fs.ts; fileOps.ts is what changes them.

/**
 * The shortcuts the desktop starts with. They are nodes like the visitor's
 * own, so they can be moved to any folder and still open from there, but
 * they can't be renamed or deleted. The Trash icon is not one of them.
 */
export const SHORTCUTS = {
  resume: { label: 'fs.resume', path: '/resume.pdf' },
  projects: { label: 'fs.projects', path: '/projects' },
  contact: { label: 'app.contact', app: 'contact' },
  terminal: { label: 'app.terminal', app: 'terminal' },
} as const satisfies Record<string, { label: TKey; path?: string; app?: AppId }>

export type ShortcutId = keyof typeof SHORTCUTS

export interface UserNode {
  /** Stable for the node's lifetime, even across renames and moves. */
  key: string
  kind: 'file' | 'dir'
  /** Also the node's id in paths. Unique among its siblings. */
  name: string
  /** Canonical path of the folder it's in. */
  parent: string
  content?: string
  /** Set on the desktop's shortcuts: which one it is (its label and target are in SHORTCUTS). */
  shortcut?: ShortcutId
  createdAt: number
  updatedAt: number
  /** Set while it's in the trash: the folder it was deleted from. */
  trashedFrom?: string
}

export type FsErrorCode =
  | 'exists'
  | 'readOnly'
  | 'notFound'
  | 'notDir'
  | 'invalidName'
  | 'quota'
  | 'tooLarge'
  | 'intoItself'

/** Why a file operation was refused. `target` is the name or path the message is about. */
export class FsError extends Error {
  code: FsErrorCode
  target: string

  constructor(code: FsErrorCode, target: string) {
    super(`${code}: ${target}`)
    this.code = code
    this.target = target
  }
}

const KEY = 'everton-os:files'

/** The shortcuts as they start out: on the desktop, named by id (what people see is their label). */
function defaultShortcuts(): UserNode[] {
  const ids = Object.keys(SHORTCUTS) as ShortcutId[]
  return ids.map((id) => ({
    key: `shortcut-${id}`,
    kind: 'file',
    name: id === 'resume' ? 'resume.pdf' : id,
    parent: '/desktop',
    shortcut: id,
    createdAt: 0,
    updatedAt: 0,
  }))
}

function load(): UserNode[] {
  let saved: { nodes?: UserNode[]; seeded?: boolean } = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as typeof saved
  } catch {
    // Unreadable: start over.
  }
  const nodes = Array.isArray(saved.nodes) ? saved.nodes : []
  // The shortcuts are added once; after that they live wherever the visitor put them.
  return saved.seeded ? nodes : [...defaultShortcuts(), ...nodes]
}

export const userFs = createStore<{ nodes: UserNode[] }>({ nodes: load() })

/** Saves `nodes` and only then publishes them, so a full storage refuses the change instead of losing it later. */
export function commit(nodes: UserNode[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, seeded: true, nodes }))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new FsError('quota', '')
    // Storage blocked: the files still work until the page is closed.
  }
  userFs.set({ nodes })
}

// Another tab changed the files.
window.addEventListener('storage', (event) => {
  if (event.key === KEY) userFs.set({ nodes: load() })
})

export const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** Whether `path` is `folder` or somewhere inside it. */
export const isInside = (path: string, folder: string) =>
  path === folder || path.startsWith(folder === '/' ? '/' : `${folder}/`)
