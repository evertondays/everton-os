import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import { AppIcon } from '../../components/AppIcon.tsx'
import { useT } from '../../i18n/index.ts'
import { type AppDef, apps, resumeShortcut } from '../../system/apps.ts'
import { PROJECTS_PATH, RESUME_PATH } from '../../system/fs.ts'
import { useOS } from '../../system/os.ts'
import { PANEL_HEIGHT } from './layout.ts'

// Desktop icons that behave like on Windows: they sit on a grid, a click
// selects, Ctrl+click adds to the selection, dragging on the empty desktop
// draws a selection rectangle, and dragging icons moves the whole selection.
// Where each icon was left is remembered in the browser.

interface DesktopIcon {
  id: string
  label: string
  icon: Pick<AppDef, 'icon' | 'tint'>
  open(): void
}

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

export function DesktopIcons() {
  const t = useT()
  const os = useOS()
  const area = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [saved, setSaved] = useState<Layout>(loadLayout)
  // Measured from the window first, so the first paint already has the real grid.
  const [grid, setGrid] = useState(() => measureGrid(window.innerWidth, window.innerHeight - PANEL_HEIGHT))
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [drag, setDrag] = useState<{ ids: string[]; dx: number; dy: number } | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)

  const icons: DesktopIcon[] = [
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

  const localPoint = (event: PointerEvent) => {
    const rect = area.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
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
    >
      {icons.map((icon) => {
        const { left, top } = iconBox(layout[icon.id])
        const dragging = drag?.ids.includes(icon.id)
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
    </div>
  )
}
