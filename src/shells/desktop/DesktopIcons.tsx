import { ExternalLink, FilePlus, FolderPlus, Pencil, Settings, Trash2 } from 'lucide-react'
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { ContextMenu, type MenuItem, type MenuState } from '../../components/ContextMenu.tsx'
import { RenameField } from '../../components/NameField.tsx'
import {
  DESKTOP_PATH,
  type Entry,
  TRASH_PATH,
  type Tile,
  canModify,
  draggedPaths,
  fsErrorMessage,
  isFileDrag,
  isOwn,
  joinPath,
  tileFor,
  useLocale,
  useOS,
  useT,
} from '../../sdk/index.ts'
import { appName, apps } from '../../system/apps.ts'
import { setPointerDropFolder, windowDropAt } from '../../system/fileUi.ts'
import { PANEL_HEIGHT } from './layout.ts'

// Desktop icons that behave like on Windows: they sit on a grid, a click
// selects, Ctrl+click adds to the selection, dragging on the empty desktop
// draws a selection rectangle, and dragging icons moves the whole selection.
// Where each icon was left is remembered in the browser.
// Besides the Trash, the icons are what's in the Desktop folder: the shortcuts
// it starts with (symlinks and launchers) and the visitor's own files and
// folders, which the right-click menu creates, renames and deletes. Dropping
// icons on a folder moves them in.

interface DesktopIcon {
  /** The inode's number, so an icon keeps its place when renamed or moved away and back. */
  id: string
  label: string
  icon: Tile
  /** A symlink: the icon gets a shortcut's arrow. */
  link?: boolean
  open(): void
  /** The file, folder or shortcut this icon stands for. */
  entry?: Entry
  /** The folder that files dropped on this icon go into (the Trash deletes them). */
  folder?: string
}

/** How long a refused file operation stays on screen (ms). */
const ERROR_TIMEOUT = 4000

interface Cell {
  col: number
  row: number
}

type Layout = Record<string, Cell>

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Where dragged icons would go: a folder icon of the desktop, or a window (into a folder of Files, or nowhere). */
type DropTarget = { kind: 'icon'; folder: string; icon: string } | { kind: 'window'; folder: string | null }

type Gesture =
  | { kind: 'icons'; id: string; ids: string[]; startX: number; startY: number; moved: boolean; additive: boolean }
  | { kind: 'marquee'; startX: number; startY: number; base: Set<string> }

const CELL_WIDTH = 108
const CELL_HEIGHT = 100
const MARGIN = 12
/** Pointer travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD = 4
const STORAGE_KEY = 'everton-os:desktop-icons'
const TRASH_ICON = 'trash'

const cellKey = ({ col, row }: Cell) => `${col}:${row}`

const cellBox = ({ col, row }: Cell): Box => {
  const left = MARGIN + col * CELL_WIDTH
  const top = MARGIN + row * CELL_HEIGHT
  return { left, top, right: left + CELL_WIDTH, bottom: top + CELL_HEIGHT }
}

/** The visible part of an icon, inside its cell. */
const iconBox = (cell: Cell): Box => {
  const { left, top, right, bottom } = cellBox(cell)
  return { left: left + 4, top: top + 4, right: right - 4, bottom: bottom - 4 }
}

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * The first version keyed icons `user:<key>`, and the shortcuts by their name
 * (`resume`); now every icon is keyed by its inode, and the shortcuts' are
 * `shortcut-<name>`.
 */
function migrateId(id: string): string {
  if (id.startsWith('user:')) return id.slice('user:'.length)
  if (['resume', 'projects', 'contact', 'terminal'].includes(id)) return `shortcut-${id}`
  return id
}

function loadLayout(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Layout
    return Object.fromEntries(Object.entries(saved).map(([id, cell]) => [migrateId(id), cell]))
  } catch {
    return {}
  }
}

function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // The arrangement just won't survive a reload.
  }
}

/** The free cell closest to `target`; columns fill top to bottom, like the default arrangement. */
function nearestFree(target: Cell, taken: Set<string>, cols: number, rows: number): Cell {
  let best = target
  let bestDistance = Infinity
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (taken.has(cellKey({ col, row }))) continue
      const distance = (col - target.col) ** 2 + (row - target.row) ** 2
      if (distance < bestDistance) {
        best = { col, row }
        bestDistance = distance
      }
    }
  }
  return best
}

/** A cell for every icon: where it was left if that still fits the screen, else the first free one. */
function arrange(ids: string[], saved: Layout, cols: number, rows: number): Layout {
  const layout: Layout = {}
  const taken = new Set<string>()
  for (const id of ids) {
    const cell = saved[id]
    if (cell && cell.col < cols && cell.row < rows && !taken.has(cellKey(cell))) {
      layout[id] = cell
      taken.add(cellKey(cell))
    }
  }
  for (const id of ids) {
    if (layout[id]) continue
    const cell = firstFree(taken, cols, rows)
    layout[id] = cell
    taken.add(cellKey(cell))
  }
  return layout
}

/** The first free cell going down each column in turn, which is how icons start out. */
function firstFree(taken: Set<string>, cols: number, rows: number): Cell {
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (!taken.has(cellKey({ col, row }))) return { col, row }
    }
  }
  return { col: 0, row: 0 }
}

/** How many cells fit in the desktop area (the screen above the panel). */
function measureGrid(width: number, height: number) {
  return {
    cols: Math.max(1, Math.floor((width - MARGIN * 2) / CELL_WIDTH)),
    rows: Math.max(1, Math.floor((height - MARGIN * 2) / CELL_HEIGHT)),
  }
}

/** The cell under a point of the desktop. */
function cellAt(x: number, y: number, cols: number, rows: number): Cell {
  return {
    col: Math.min(cols - 1, Math.max(0, Math.floor((x - MARGIN) / CELL_WIDTH))),
    row: Math.min(rows - 1, Math.max(0, Math.floor((y - MARGIN) / CELL_HEIGHT))),
  }
}

export function DesktopIcons() {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  os.fs.useWatch()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [saved, setSaved] = useState<Layout>(loadLayout)
  // Measured from the window first, so the first paint already has the real grid.
  const [grid, setGrid] = useState(() => measureGrid(window.innerWidth, window.innerHeight - PANEL_HEIGHT))
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  /** Icons being dragged, and the folder icon they would go into if dropped now. */
  const [drag, setDrag] = useState<{ ids: string[]; dx: number; dy: number; target: string | null } | null>(null)
  /** The folder icon a file dragged from a Files window is over. */
  const [dropHover, setDropHover] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)

  /** Runs a file operation, showing why if it's refused. */
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError(null)
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
    }
  }

  // The Trash is always here. Everything else is what's in the Desktop folder,
  // starting with the shortcuts (which the visitor may have moved elsewhere).
  const trashIcon: DesktopIcon = {
    id: TRASH_ICON,
    label: appName(apps.get('trash')!, locale),
    icon: apps.get('trash')!,
    open: () => os.exec('trash', {}, 'desktop_icon'),
    folder: TRASH_PATH,
  }
  const entryIcons: DesktopIcon[] = os.fs.readdir(DESKTOP_PATH).map((entry) => {
    const target = entry.inode.kind === 'symlink' ? os.fs.lookup(entry.path) : entry
    const tile = tileFor(entry)
    return {
      id: entry.inode.ino,
      label: entry.displayName,
      icon: tile,
      link: tile.link,
      open: () => void attempt(() => os.openFile(entry.path, 'desktop_icon')),
      entry,
      folder: target?.inode.kind === 'dir' ? target.path : undefined,
    }
  })
  const isShortcut = (icon: DesktopIcon) => icon.entry?.inode.flags?.includes('immutable') ?? false
  const icons = [...entryIcons.filter(isShortcut), trashIcon, ...entryIcons.filter((icon) => !isShortcut(icon))]
  const ids = icons.map((icon) => icon.id)
  const idsKey = ids.join()

  // The grid follows the size of the desktop.
  useEffect(() => {
    const element = area.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const next = measureGrid(element.clientWidth, element.clientHeight)
      setGrid((current) => (current.cols === next.cols && current.rows === next.rows ? current : next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(
    () => arrange(idsKey.split(','), saved, grid.cols, grid.rows),
    [idsKey, saved, grid.cols, grid.rows],
  )

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = area.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(null), ERROR_TIMEOUT)
    return () => window.clearTimeout(timer)
  }, [error])

  /** Selected icons that can be renamed or deleted: the visitor's own, not shortcuts. */
  const ownSelected = () => icons.filter((icon) => icon.entry && canModify(icon.entry) && selected.has(icon.id))

  /** Puts icons in the free cells nearest to a point of the desktop. */
  const place = (iconIds: string[], at: { x: number; y: number }) => {
    const next: Layout = { ...layout }
    const taken = new Set(Object.values(layout).map(cellKey))
    for (const id of iconIds) {
      const cell = nearestFree(cellAt(at.x, at.y, grid.cols, grid.rows), taken, grid.cols, grid.rows)
      next[id] = cell
      taken.add(cellKey(cell))
    }
    setSaved(next)
    saveLayout(next)
  }

  /** Creates a file or folder in the Desktop folder, in the free cell nearest to where the menu was opened. */
  const create = (kind: 'file' | 'dir', at: { x: number; y: number }) =>
    attempt(async () => {
      const name = t(kind === 'dir' ? 'fs.newFolder' : 'fs.newFile')
      const path = await os.fs.create(joinPath(DESKTOP_PATH, name), { kind, unique: true })
      const id = os.fs.lstat(path).inode.ino
      place([id], at)
      setSelected(new Set([id]))
      setRenaming(id)
    })

  const rename = (icon: DesktopIcon, name: string | null) => {
    setRenaming(null)
    if (name !== null && icon.entry) void attempt(() => os.fs.rename(icon.entry!.path, joinPath(DESKTOP_PATH, name)))
  }

  const remove = (targets: DesktopIcon[]) => {
    if (targets.length === 0) return
    void attempt(() => os.fs.trash(targets.map((icon) => icon.entry!.path)))
    setSelected(new Set())
  }

  const onAreaContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.target !== event.currentTarget) return
    setSelected(new Set())
    const { x, y } = localPoint(event)
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: t('action.newFile'), icon: FilePlus, onSelect: () => void create('file', { x, y }) },
        { label: t('action.newFolder'), icon: FolderPlus, onSelect: () => void create('dir', { x, y }) },
        {
          label: appName(apps.get('settings')!, locale),
          icon: Settings,
          onSelect: () => os.exec('settings', {}, 'desktop_menu'),
        },
      ],
    })
  }

  const onIconContextMenu = (event: MouseEvent, icon: DesktopIcon) => {
    event.preventDefault()
    event.stopPropagation()
    // Right-clicking outside the selection selects just that icon, like Windows.
    const group = selected.has(icon.id) ? selected : new Set([icon.id])
    setSelected(group)
    const targets = icons.filter((other) => group.has(other.id))
    const own = targets.filter((other) => other.entry && canModify(other.entry))
    const items: MenuItem[] = [
      { label: t('action.open'), icon: ExternalLink, onSelect: () => targets.forEach((other) => other.open()) },
    ]
    if (own.length === 1 && targets.length === 1) {
      items.push({ label: t('action.rename'), icon: Pencil, onSelect: () => setRenaming(icon.id) })
    }
    if (own.length > 0) items.push({ label: t('action.delete'), icon: Trash2, onSelect: () => remove(own) })
    setMenu({ x: event.clientX, y: event.clientY, items })
  }

  /** Puts the dragged icons in the cells under where they were dropped, keeping clear of the others. */
  const drop = (dragged: string[], dx: number, dy: number) => {
    const next: Layout = { ...layout }
    const taken = new Set(ids.filter((id) => !dragged.includes(id)).map((id) => cellKey(layout[id])))
    // In reading order, so a group keeps its shape when it lands.
    const ordered = [...dragged].sort((a, b) => layout[a].col - layout[b].col || layout[a].row - layout[b].row)
    for (const id of ordered) {
      const from = layout[id]
      const target = {
        col: Math.min(grid.cols - 1, Math.max(0, Math.round(from.col + dx / CELL_WIDTH))),
        row: Math.min(grid.rows - 1, Math.max(0, Math.round(from.row + dy / CELL_HEIGHT))),
      }
      const cell = nearestFree(target, taken, grid.cols, grid.rows)
      next[id] = cell
      taken.add(cellKey(cell))
    }
    setSaved(next)
    saveLayout(next)
    track('desktop_icons_moved', { icons: dragged.length })
  }

  const onIconPointerDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const additive = event.ctrlKey || event.metaKey
    let group = selected
    if (!additive && !selected.has(id)) {
      group = new Set([id])
      setSelected(group)
    }
    gesture.current = {
      kind: 'icons',
      id,
      // Ctrl+dragging an unselected icon drags it along with the selection.
      ids: [...new Set([...group, id])],
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      additive,
    }
  }

  /** The visitor's things among the dragged icons: the only ones that can go into a folder. */
  const movable = (dragged: string[]) => icons.filter((icon) => icon.entry && isOwn(icon.entry) && dragged.includes(icon.id))

  /**
   * What is under the pointer while icons are dragged: a window (and the
   * folder of a Files window there, if the pointer is on one), or a folder
   * icon of the desktop the visitor's things can go into (a folder, a
   * shortcut to one, the Trash).
   */
  const dropTargetAt = (dragged: string[], event: PointerEvent): DropTarget | null => {
    const over = windowDropAt(event.clientX, event.clientY)
    if (over) return { kind: 'window', folder: movable(dragged).length > 0 ? over.folder : null }
    if (movable(dragged).length === 0) return null
    const { x, y } = localPoint(event)
    const icon = icons.find((other) => {
      if (!other.folder || dragged.includes(other.id)) return false
      const { left, top, right, bottom } = iconBox(layout[other.id])
      return x >= left && x <= right && y >= top && y <= bottom
    })
    return icon ? { kind: 'icon', folder: icon.folder!, icon: icon.id } : null
  }

  /** Puts files into `folder`: moves them, or deletes them if it's the Trash. */
  const putInto = (folder: string, paths: string[]) => {
    if (paths.length === 0) return
    if (folder === TRASH_PATH) void attempt(() => os.fs.trash(paths))
    else void attempt(() => os.fs.move(paths, folder))
    setSelected(new Set())
  }

  // Files dragged out of a Files window: onto a folder icon they go in it,
  // onto the empty desktop they move to the Desktop folder, where they were dropped.

  const onIconDragOver = (event: DragEvent, icon: DesktopIcon) => {
    if (!icon.folder || !isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropHover(icon.id)
  }

  const onIconDrop = (event: DragEvent, icon: DesktopIcon) => {
    if (!icon.folder) return
    event.preventDefault()
    event.stopPropagation()
    setDropHover(null)
    putInto(icon.folder, draggedPaths(event.dataTransfer))
  }

  const onAreaDragOver = (event: DragEvent) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onAreaDrop = (event: DragEvent) => {
    const paths = draggedPaths(event.dataTransfer)
    if (paths.length === 0) return
    event.preventDefault()
    // Moving keeps each inode, and with it its icon's id.
    const iconIds = paths.flatMap((path) => os.fs.lookup(path, { follow: false })?.inode.ino ?? [])
    const at = localPoint(event)
    void attempt(async () => {
      await os.fs.move(paths, DESKTOP_PATH)
      place(iconIds, at)
    })
  }

  const onIconPointerMove = (event: PointerEvent) => {
    const current = gesture.current
    if (current?.kind !== 'icons') return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.moved) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
      current.moved = true
      setSelected(new Set(current.ids))
    }
    const target = dropTargetAt(current.ids, event)
    setDrag({ ids: current.ids, dx, dy, target: target?.kind === 'icon' ? target.icon : null })
    setPointerDropFolder(target?.kind === 'window' ? target.folder : null)
  }

  const endDrag = () => {
    gesture.current = null
    setDrag(null)
    setPointerDropFolder(null)
  }

  const onIconPointerUp = (event: PointerEvent) => {
    const current = gesture.current
    if (current?.kind !== 'icons') return
    endDrag()
    const target = current.moved ? dropTargetAt(current.ids, event) : null
    if (target?.folder) {
      putInto(
        target.folder,
        movable(current.ids).map((icon) => icon.entry!.path),
      )
    } else if (target?.kind === 'window') {
      // Let go over a window, but not on a folder: the icons go back where they were.
    } else if (current.moved) {
      drop(current.ids, event.clientX - current.startX, event.clientY - current.startY)
    } else if (current.additive) {
      const next = new Set(selected)
      if (next.has(current.id)) next.delete(current.id)
      else next.add(current.id)
      setSelected(next)
    } else {
      // A plain click on one icon of a group narrows the selection to it.
      setSelected(new Set([current.id]))
    }
  }

  const onAreaPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const additive = event.ctrlKey || event.metaKey
    const { x, y } = localPoint(event)
    gesture.current = { kind: 'marquee', startX: x, startY: y, base: additive ? new Set(selected) : new Set() }
    if (!additive) setSelected(new Set())
  }

  const onAreaPointerMove = (event: PointerEvent) => {
    const current = gesture.current
    if (current?.kind !== 'marquee') return
    const { x, y } = localPoint(event)
    const box = {
      left: Math.min(current.startX, x),
      top: Math.min(current.startY, y),
      right: Math.max(current.startX, x),
      bottom: Math.max(current.startY, y),
    }
    setMarquee(box)
    const hit = ids.filter((id) => overlaps(box, iconBox(layout[id])))
    setSelected(new Set([...current.base, ...hit]))
  }

  const onAreaPointerUp = () => {
    if (gesture.current?.kind !== 'marquee') return
    gesture.current = null
    setMarquee(null)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelected(new Set(ids))
    } else if (event.key === 'Escape') {
      setSelected(new Set())
    } else if (event.key === 'Delete') {
      remove(ownSelected())
    } else if (event.key === 'F2') {
      const own = ownSelected()
      if (own.length === 1 && selected.size === 1) {
        event.preventDefault()
        setRenaming(own[0].id)
      }
    } else if (event.key === 'Enter') {
      const focused = (event.target as HTMLElement).dataset.icon
      const targets = selected.size > 0 ? [...selected] : focused ? [focused] : []
      icons.filter((icon) => targets.includes(icon.id)).forEach((icon) => icon.open())
    }
  }

  return (
    <div
      className="desktop-icons"
      ref={area}
      onPointerDown={onAreaPointerDown}
      onPointerMove={onAreaPointerMove}
      onPointerUp={onAreaPointerUp}
      onPointerCancel={onAreaPointerUp}
      onKeyDown={onKeyDown}
      onContextMenu={onAreaContextMenu}
      onDragOver={onAreaDragOver}
      onDrop={onAreaDrop}
    >
      {icons.map((icon) => {
        const { left, top } = iconBox(layout[icon.id])
        const dragging = drag?.ids.includes(icon.id)
        if (renaming === icon.id && icon.entry) {
          return (
            <div key={icon.id} className="desktop-icon is-selected is-renaming" style={{ left, top }}>
              <AppIcon app={icon.icon} size={52} link={icon.link} />
              <RenameField
                name={icon.entry.name}
                keepExtension={icon.entry.inode.kind === 'file'}
                onDone={(name) => rename(icon, name)}
              />
            </div>
          )
        }
        return (
          <button
            key={icon.id}
            data-icon={icon.id}
            className={`desktop-icon${selected.has(icon.id) ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${
              drag?.target === icon.id || dropHover === icon.id ? ' is-drop-target' : ''
            }`}
            style={{
              left,
              top,
              transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
            }}
            aria-pressed={selected.has(icon.id)}
            onPointerDown={(event) => onIconPointerDown(event, icon.id)}
            onPointerMove={onIconPointerMove}
            onPointerUp={onIconPointerUp}
            onPointerCancel={endDrag}
            onDoubleClick={icon.open}
            onContextMenu={(event) => onIconContextMenu(event, icon)}
            onDragOver={(event) => onIconDragOver(event, icon)}
            onDragLeave={() => setDropHover((hover) => (hover === icon.id ? null : hover))}
            onDrop={(event) => onIconDrop(event, icon)}
          >
            <AppIcon app={icon.icon} size={52} link={icon.link} />
            <span className="desktop-icon-label" title={icon.label}>
              {icon.label}
            </span>
          </button>
        )
      })}
      {marquee && (
        <div
          className="desktop-marquee"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
          }}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {error && (
        <p className="desktop-toast" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
