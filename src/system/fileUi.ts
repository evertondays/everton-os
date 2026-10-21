import { File, FileText, FileUser, Folder, Globe, Image, type LucideIcon } from 'lucide-react'
import type { Translate } from '../i18n/index.ts'
import { apps } from './apps.ts'
import { vfs } from './fs.ts'
import { createStore, useStore } from './store.ts'
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

// Made ahead of time: a drag image has to be loaded when the drag starts.
const NO_DRAG_IMAGE =
  typeof document === 'undefined'
    ? null
    : Object.assign(document.createElement('img'), { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAACH5BAEAAAAALAAAAAABAAEAAAIBRAA7' })

/**
 * Makes a copy of `source` follow the pointer while it's dragged with HTML
 * drag and drop, in place of the browser's snapshot of it (on Windows, a pale
 * square that loses the rounded corners). Call it from the dragstart handler.
 */
export function showDragGhost(
  event: { clientX: number; clientY: number; dataTransfer: DataTransfer },
  source: HTMLElement,
) {
  if (!NO_DRAG_IMAGE) return
  const box = source.getBoundingClientRect()
  const grab = { x: event.clientX - box.left, y: event.clientY - box.top }
  const ghost = source.cloneNode(true) as HTMLElement
  ghost.classList.add('drag-ghost')
  ghost.classList.remove('is-drop-target')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.style.width = `${box.width}px`
  const follow = (x: number, y: number) => {
    ghost.style.transform = `translate(${x - grab.x}px, ${y - grab.y}px)`
  }
  follow(event.clientX, event.clientY)
  document.body.append(ghost)
  event.dataTransfer.setDragImage(NO_DRAG_IMAGE, 0, 0)

  const onDragOver = (over: DragEvent) => follow(over.clientX, over.clientY)
  const end = () => {
    ghost.remove()
    document.removeEventListener('dragover', onDragOver, true)
    document.removeEventListener('drop', end, true)
    source.removeEventListener('dragend', end)
  }
  document.addEventListener('dragover', onDragOver, true)
  // A drop that moves the file takes `source` out of the page, and its dragend never reaches the document.
  document.addEventListener('drop', end, true)
  source.addEventListener('dragend', end)
}

// Desktop icons are dragged with the pointer, not with HTML drag and drop, so
// a Files window can't hear them coming. Instead, its drop targets carry the
// folder they stand for in an attribute, the desktop looks under the pointer,
// and the folder it would drop into is shared here for the window to light up.

/** The attribute that makes an element a place to drop files into its folder. */
export const DROP_FOLDER_ATTRIBUTE = 'data-drop-folder'

const pointerDrop = createStore<{ folder: string | null }>({ folder: null })

export const setPointerDropFolder = (folder: string | null) => {
  if (pointerDrop.get().folder !== folder) pointerDrop.set({ folder })
}

/** The folder desktop icons being dragged would go into if let go now, when it's in a window. */
export const usePointerDropFolder = () => useStore(pointerDrop, (state) => state.folder)

/**
 * What is under a point, above the desktop: null when it's the desktop
 * itself; else whether it's a window, and the folder of the drop target
 * there, if any.
 */
export function windowDropAt(x: number, y: number): { folder: string | null } | null {
  // Elements being dragged ignore the pointer, so this is what's beneath them.
  const top = document.elementFromPoint(x, y)
  if (!top?.closest('.winbox')) return null
  return { folder: top.closest(`[${DROP_FOLDER_ATTRIBUTE}]`)?.getAttribute(DROP_FOLDER_ATTRIBUTE) ?? null }
}

/** The message for a file system error; anything else is a bug and is thrown again. */
export function fsErrorMessage(t: Translate, error: unknown): string {
  if (error instanceof VfsError) return t(`fs.error.${error.reason}`, { name: error.target })
  throw error
}

/** Whether an entry can be renamed and deleted: the visitor's own, unless immutable (shortcuts can only be moved). */
export const canModify = (entry: Entry) => entry.inode.layer === 'upper' && !entry.inode.flags?.includes('immutable')

/** Whether an entry is the visitor's (and so can be moved). */
export const isOwn = (entry: Entry) => entry.inode.layer === 'upper'
