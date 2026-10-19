import { File, FileText, FileUser, Folder, Globe, Image, type LucideIcon } from 'lucide-react'
import type { Translate } from '../i18n/index.ts'
import { apps } from './apps.ts'
import { vfs } from './fs.ts'
import { VfsError } from './vfs/errors.ts'
import { LAUNCHER_MIME, URL_MIME } from './vfs/mime.ts'
import { type Entry, launcherApp } from './vfs/vfs.ts'

// What files look like and how they move around the interface, shared by the
// desktop, Files and the dialogs.

/** An icon tile: a glyph on a gradient. `ink` colors the glyph (white by default). */
export interface Tile {
  /** Set on apps' tiles. */
  id?: string
  icon: LucideIcon
  tint: [string, string]
  ink?: string
}

export const tiles = {
  folder: { icon: Folder, tint: ['#4fc3ff', '#1589e0'] },
  // A white page with blue writing.
  text: { icon: FileText, tint: ['#ffffff', '#dde4ee'], ink: '#2f6fe0' },
  resume: { icon: FileUser, tint: ['#ff7a70', '#d93a3a'] },
  image: { icon: Image, tint: ['#ffb14a', '#f0703a'] },
  link: { icon: Globe, tint: ['#58b4ff', '#3464e0'] },
  unknown: { icon: File, tint: ['#e6eaf0', '#b9c1cc'], ink: '#4a5260' },
} satisfies Record<string, Tile>

/**
 * How an entry looks as a tile. A launcher shows its app; a symlink shows
 * what it points to, marked as a link (a little arrow).
 */
export function tileFor(entry: Entry): Tile & { link?: boolean } {
  if (entry.inode.kind === 'symlink') {
    const target = vfs.lookup(entry.path)
    return { ...(target ? tileFor(target) : tiles.unknown), link: true }
  }
  if (entry.inode.kind === 'dir') return tiles.folder
  if (entry.mime === LAUNCHER_MIME) return apps.get(launcherApp(entry.name)) ?? tiles.unknown
  if (entry.mime === 'application/pdf') return tiles.resume
  if (entry.mime.startsWith('text/')) return tiles.text
  if (entry.mime.startsWith('image/')) return tiles.image
  if (entry.mime === URL_MIME) return tiles.link
  return tiles.unknown
}

/** The drag-and-drop type of files dragged out of Files: a JSON list of their paths. */
export const FILE_DRAG_TYPE = 'application/x-everton-os-paths'

/** The paths in a drop of FILE_DRAG_TYPE, or none. */
export function draggedPaths(data: DataTransfer): string[] {
  try {
    const paths: unknown = JSON.parse(data.getData(FILE_DRAG_TYPE) || '[]')
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

/** Whether a drag carries files from Files (its paths can only be read on drop). */
export const isFileDrag = (data: DataTransfer) => data.types.includes(FILE_DRAG_TYPE)

/** The message for a file system error; anything else is a bug and is thrown again. */
export function fsErrorMessage(t: Translate, error: unknown): string {
  if (error instanceof VfsError) return t(`fs.error.${error.reason}`, { name: error.target })
  throw error
}

/** Whether an entry can be renamed and deleted: the visitor's own, unless immutable (shortcuts can only be moved). */
export const canModify = (entry: Entry) => entry.inode.layer === 'upper' && !entry.inode.flags?.includes('immutable')

/** Whether an entry is the visitor's (and so can be moved). */
export const isOwn = (entry: Entry) => entry.inode.layer === 'upper'
