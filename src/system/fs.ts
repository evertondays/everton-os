import { useSyncExternalStore } from 'react'
import { type FileSource, type FileType, track } from '../analytics.ts'
import { getResume } from '../data/resume.ts'
import { apps, appName } from './apps.ts'
import { settings } from './settings.ts'
import { IdbFs } from './vfs/drivers/idbfs.ts'
import { MemFs } from './vfs/drivers/memfs.ts'
import { OverlayFs } from './vfs/drivers/overlayfs.ts'
import { ResumeFs } from './vfs/drivers/resumefs.ts'
import { LAUNCHER_MIME, SYMLINK_MIME, URL_MIME } from './vfs/mime.ts'
import { LEGACY_KEY, LEGACY_VERSION, seed } from './vfs/seed.ts'
import type { Content, UpperFs } from './vfs/types.ts'
import { type Entry, type ResolveOptions, TRASH_PATH, Vfs } from './vfs/vfs.ts'

// The system's file system: the résumé (resumefs) with the visitor's files
// (idbfs, or memfs when IndexedDB is blocked) laid over it, mounted at the
// root. The shells wait for it (useFsReady) before showing files.

export const RESUME_PATH = '/resume.pdf'
export const PROJECTS_PATH = '/projects'

/** How long IndexedDB gets to open before the files fall back to memory. */
const IDB_TIMEOUT = 4000

const resumefs = new ResumeFs(getResume, settings.get().locale)
settings.subscribe(() => resumefs.setLocale(settings.get().locale))

export const vfs = new Vfs({
  launcherName(id) {
    const app = apps.get(id)
    return app && appName(app, settings.get().locale)
  },
})

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function mount() {
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(LEGACY_KEY)
  } catch {
    // Storage blocked: nothing to bring over.
  }
  let upper: UpperFs = new IdbFs()
  let seeded: Awaited<ReturnType<typeof seed>>
  try {
    await withTimeout(upper.init(), IDB_TIMEOUT)
    seeded = await seed(upper, legacy)
  } catch {
    // No IndexedDB (blocked, private mode): the files last until the page closes.
    upper = new MemFs()
    await upper.init()
    seeded = await seed(upper, legacy)
  }
  vfs.mount(new OverlayFs(resumefs, upper))
  if (seeded === 'migrated' && upper.name === 'idbfs') track('fs_migrated', { from: LEGACY_VERSION })
}

void mount()

// React

const subscribe = (listener: () => void) => vfs.subscribe(listener)

/** Re-renders whenever anything in the file system changes; the number is a version. */
export function useFsVersion(): number {
  return useSyncExternalStore(subscribe, () => vfs.version)
}

/** Whether the file system is mounted (the visitor's files are loaded). */
export function useFsReady(): boolean {
  return useSyncExternalStore(subscribe, () => vfs.mounted)
}

/** Whether there is anything in the Trash. */
export function useTrashFull(): boolean {
  return useSyncExternalStore(subscribe, () => vfs.mounted && vfs.readdir(TRASH_PATH).length > 0)
}

// Analytics

/**
 * `path` as it may be sent to analytics: a path through the visitor's own
 * files or folders is cut at the first of them, so their names never leave the browser.
 */
export function publicPath(path: string): string {
  let chain: Entry[]
  try {
    chain = vfs.chain(path, { follow: false })
  } catch {
    return path
  }
  const own = chain.findIndex((entry) => entry.inode.layer === 'upper')
  if (own === -1) return chain.at(-1)!.path
  return `${chain[own - 1].path}/*`.replace('//', '/')
}

/** App arguments with their paths made public (see publicPath), for the app_opened event. */
export function publicArgs(args: { files?: string[]; url?: string }): { path?: string; url?: string } {
  return {
    ...(args.files?.[0] && { path: publicPath(args.files[0]) }),
    ...(args.url && { url: args.url }),
  }
}

/** The file types the analytics have always used, from a mime type. */
export function legacyFileType(mime: string): FileType {
  if (mime === SYMLINK_MIME || mime === LAUNCHER_MIME) return 'shortcut'
  if (mime === 'application/pdf') return 'resume'
  if (mime === 'text/markdown') return 'markdown'
  if (mime.startsWith('image/')) return 'image'
  if (mime === URL_MIME) return 'link'
  return 'text'
}

// What apps get as `os.fs`: the VFS, with each change reported to analytics
// as coming from `source` (the app that made it).

export type FsApi = ReturnType<typeof fsApi>

const kindOf = (path: string) => {
  const kind = vfs.lookup(path, { follow: false })?.inode.kind
  return kind === 'dir' ? 'folder' : kind === 'symlink' ? 'symlink' : 'file'
}

const sizeOf = (content: string | Blob) => (typeof content === 'string' ? content.length : content.size)

export function fsApi(source: FileSource) {
  return {
    // Synchronous: from the cache.
    stat: (path: string, options?: ResolveOptions) => vfs.stat(path, options),
    lstat: (path: string, options?: Omit<ResolveOptions, 'follow'>) => vfs.lstat(path, options),
    lookup: (path: string, options?: ResolveOptions) => vfs.lookup(path, options),
    chain: (path: string, options?: ResolveOptions) => vfs.chain(path, options),
    readdir: (path: string, options?: ResolveOptions & { all?: boolean }) => vfs.readdir(path, options),
    readlink: (path: string, options?: Omit<ResolveOptions, 'follow'>) => vfs.readlink(path, options),
    realpath: (path: string, options?: Omit<ResolveOptions, 'follow'>) => vfs.realpath(path, options),
    displayName: (path: string) => vfs.displayName(path),
    canCreateIn: (path: string) => vfs.canCreateIn(path),
    /** Hook: re-renders when the file system changes. */
    useWatch: useFsVersion,
    mounts: () => vfs.drivers,

    // Asynchronous.
    readFile: (path: string, options?: Omit<ResolveOptions, 'follow'>): Promise<Content> => vfs.readFile(path, options),
    async writeFile(path: string, content: string | Blob, options?: { cwd?: string }) {
      const existed = vfs.lookup(path, options) !== null
      const written = await vfs.writeFile(path, content, options)
      if (existed) track('file_saved', { characters: sizeOf(content) })
      else track('file_created', { kind: 'file', source })
      return written
    },
    async create(
      path: string,
      options?: { kind?: 'file' | 'dir'; unique?: boolean; content?: string | Blob; extension?: boolean; cwd?: string },
    ) {
      const created = await vfs.create(path, options)
      track('file_created', { kind: options?.kind === 'dir' ? 'folder' : 'file', source })
      return created
    },
    async mkdir(path: string, options?: { cwd?: string; unique?: boolean }) {
      const created = await vfs.mkdir(path, options)
      track('file_created', { kind: 'folder', source })
      return created
    },
    async symlink(target: string, path: string, options?: { cwd?: string }) {
      const created = await vfs.symlink(target, path, options)
      track('file_created', { kind: 'symlink', source })
      return created
    },
    touch: (path: string, options?: { cwd?: string }) => {
      const existed = vfs.lookup(path, { ...options, follow: false }) !== null
      return vfs.touch(path, options).then((touched) => {
        if (!existed) track('file_created', { kind: 'file', source })
        return touched
      })
    },
    async rename(from: string, to: string, options?: { cwd?: string }) {
      const kind = kindOf(from)
      const renamed = await vfs.rename(from, to, options)
      track('file_renamed', { kind })
      return renamed
    },
    async move(paths: string[], target: string, options?: { unique?: boolean; cwd?: string }) {
      const items = await vfs.move(paths, target, options)
      if (items > 0) track('file_moved', { items, source })
      return items
    },
    async trash(paths: string[], options?: { cwd?: string }) {
      const items = await vfs.trash(paths, options)
      if (items > 0) track('file_deleted', { items, permanent: false, source })
      return items
    },
    async restore(paths: string[]) {
      const items = await vfs.restore(paths)
      if (items > 0) track('file_restored', { items })
      return items
    },
    async remove(paths: string[], options?: { cwd?: string }) {
      const items = await vfs.remove(paths, options)
      if (items > 0) track('file_deleted', { items, permanent: true, source })
      return items
    },
    async emptyTrash() {
      const items = await vfs.emptyTrash()
      if (items > 0) track('trash_emptied', { items })
      return items
    },
  }
}
