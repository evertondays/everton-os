import { createStore } from './store.ts'

// The visitor's own files and folders. They live in this browser only and are
// laid over the résumé tree by fs.ts; fileOps.ts is what changes them.

export interface UserNode {
  /** Stable for the node's lifetime, even across renames and moves. */
  key: string
  kind: 'file' | 'dir'
  /** Also the node's id in paths. Unique among its siblings. */
  name: string
  /** Canonical path of the folder it's in. */
  parent: string
  content?: string
  createdAt: number
  updatedAt: number
  /** Set while it's in the trash: the folder it was deleted from. */
  trashedFrom?: string
}

export type FsErrorCode = 'exists' | 'readOnly' | 'notFound' | 'notDir' | 'invalidName' | 'quota' | 'tooLarge'

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

function load(): UserNode[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { nodes?: UserNode[] }
    return Array.isArray(saved.nodes) ? saved.nodes : []
  } catch {
    return []
  }
}

export const userFs = createStore<{ nodes: UserNode[] }>({ nodes: load() })

/** Saves `nodes` and only then publishes them, so a full storage refuses the change instead of losing it later. */
export function commit(nodes: UserNode[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, nodes }))
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
