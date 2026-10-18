import { ExternalLink, FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { ContextMenu, type MenuItem, type MenuState } from '../../components/ContextMenu.tsx'
import { RenameField } from '../../components/NameField.tsx'
import { useT } from '../../i18n/index.ts'
import { type AppDef, apps, resumeShortcut, userNodeIcons } from '../../system/apps.ts'
import { createNode, fsErrorMessage, renameNode, trashNodes } from '../../system/fileOps.ts'
import {
  DESKTOP_PATH,
  type FsNode,
  PROJECTS_PATH,
  RESUME_PATH,
  childPath,
  useFs,
  visibleChildren,
  walk,
} from '../../system/fs.ts'
import { openNode, useOS } from '../../system/os.ts'
import { PANEL_HEIGHT } from './layout.ts'

// Desktop icons that behave like on Windows: they sit on a grid, a click
// selects, Ctrl+click adds to the selection, dragging on the empty desktop
// draws a selection rectangle, and dragging icons moves the whole selection.
// Where each icon was left is remembered in the browser.
// Next to the fixed shortcuts are the visitor's files and folders in the
// Desktop folder, which the right-click menu creates, renames and deletes.

interface DesktopIcon {
  id: string
  label: string
  icon: Pick<AppDef, 'icon' | 'tint'>
  open(): void
  /** The visitor's own file or folder this icon stands for. */
  node?: FsNode
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

type Gesture =
  | { kind: 'icons'; id: string; ids: string[]; startX: number; startY: number; moved: boolean; additive: boolean }
  | { kind: 'marquee'; startX: number; startY: number; base: Set<string> }

const CELL_WIDTH = 108
const CELL_HEIGHT = 100
const MARGIN = 12
/** Pointer travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD = 4
const STORAGE_KEY = 'everton-os:desktop-icons'

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

function loadLayout(): Layout {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Layout
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
  const os = useOS()
  const fs = useFs()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [saved, setSaved] = useState<Layout>(loadLayout)
  // Measured from the window first, so the first paint already has the real grid.
  const [grid, setGrid] = useState(() => measureGrid(window.innerWidth, window.innerHeight - PANEL_HEIGHT))
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [drag, setDrag] = useState<{ ids: string[]; dx: number; dy: number } | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)

  const shortcuts: DesktopIcon[] = [
    {
      id: 'resume',
      label: t('fs.resume'),
      icon: resumeShortcut,
      open: () => os.open('viewer', 'desktop_icon', { path: RESUME_PATH }),
    },
    {
      id: 'projects',
      label: t('fs.projects'),
      icon: apps.files,
      open: () => os.open('files', 'desktop_icon', { path: PROJECTS_PATH }),
    },
    { id: 'contact', label: t('app.contact'), icon: apps.contact, open: () => os.open('contact', 'desktop_icon') },
    { id: 'terminal', label: t('app.terminal'), icon: apps.terminal, open: () => os.open('terminal', 'desktop_icon') },
    { id: 'trash', label: t('app.trash'), icon: apps.trash, open: () => os.open('trash', 'desktop_icon') },
  ]
  const desktop = walk(fs, DESKTOP_PATH)?.at(-1)
  const userIcons: DesktopIcon[] = (desktop?.kind === 'dir' ? visibleChildren(desktop) : []).map((node) => ({
    // By key, so a renamed file stays where it was.
    id: `user:${node.key ?? node.id}`,
    label: node.name,
    icon: userNodeIcons[node.kind],
    open: () => openNode(os, node, childPath(DESKTOP_PATH, node), 'desktop_icon'),
    node,
  }))
  const icons = [...shortcuts, ...userIcons]
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

  /** Runs a file operation, showing why if it's refused. */
  const attempt = (action: () => void) => {
    try {
      action()
      setError(null)
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
    }
  }

  const ownSelected = () => icons.filter((icon) => icon.node && selected.has(icon.id))

  /** Creates a file or folder in the Desktop folder, in the free cell nearest to where the menu was opened. */
  const create = (kind: 'file' | 'dir', at: { x: number; y: number }) =>
    attempt(() => {
      const { key } = createNode(DESKTOP_PATH, kind, t(kind === 'dir' ? 'fs.newFolder' : 'fs.newFile'), 'desktop')
      const id = `user:${key}`
      const taken = new Set(ids.map((other) => cellKey(layout[other])))
      const next = { ...layout, [id]: nearestFree(cellAt(at.x, at.y, grid.cols, grid.rows), taken, grid.cols, grid.rows) }
      setSaved(next)
      saveLayout(next)
      setSelected(new Set([id]))
      setRenaming(id)
    })

  const rename = (icon: DesktopIcon, name: string | null) => {
    setRenaming(null)
    if (name !== null && icon.node) attempt(() => renameNode(childPath(DESKTOP_PATH, icon.node!), name))
  }

  const remove = (targets: DesktopIcon[]) => {
    if (targets.length === 0) return
    attempt(() => trashNodes(targets.map((icon) => childPath(DESKTOP_PATH, icon.node!)), 'desktop'))
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
        { label: t('action.newFile'), icon: FilePlus, onSelect: () => create('file', { x, y }) },
        { label: t('action.newFolder'), icon: FolderPlus, onSelect: () => create('dir', { x, y }) },
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
    const own = targets.filter((other) => other.node)
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
    setDrag({ ids: current.ids, dx, dy })
  }

  const onIconPointerUp = (event: PointerEvent) => {
    const current = gesture.current
    if (current?.kind !== 'icons') return
    gesture.current = null
    setDrag(null)
    if (current.moved) {
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
    >
      {icons.map((icon) => {
        const { left, top } = iconBox(layout[icon.id])
        const dragging = drag?.ids.includes(icon.id)
        if (renaming === icon.id && icon.node) {
          return (
            <div key={icon.id} className="desktop-icon is-selected is-renaming" style={{ left, top }}>
              <AppIcon app={icon.icon} size={52} />
              <RenameField
                name={icon.node.name}
                keepExtension={icon.node.kind === 'file'}
                onDone={(name) => rename(icon, name)}
              />
            </div>
          )
        }
        return (
          <button
            key={icon.id}
            data-icon={icon.id}
            className={`desktop-icon${selected.has(icon.id) ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
            style={{
              left,
              top,
              transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
            }}
            aria-pressed={selected.has(icon.id)}
            onPointerDown={(event) => onIconPointerDown(event, icon.id)}
            onPointerMove={onIconPointerMove}
            onPointerUp={onIconPointerUp}
            onPointerCancel={() => {
              gesture.current = null
              setDrag(null)
            }}
            onDoubleClick={icon.open}
            onContextMenu={(event) => onIconContextMenu(event, icon)}
          >
            <AppIcon app={icon.icon} size={52} />
            <span>{icon.label}</span>
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
