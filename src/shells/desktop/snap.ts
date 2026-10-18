import { workArea } from './layout.ts'

// Window snapping, as on Windows: drag a window against a screen edge and it
// fills half of the screen, a corner gives a quarter, the top edge maximizes.

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'maximize'

export type SnapSide = 'left' | 'right'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** How close to an edge the cursor has to be. Generous, since it may also leave the page. */
const EDGE = 8
/** How far along a side edge a corner reaches. */
const CORNER = 96

/** The zone under the cursor while a window is dragged, if any. */
export function zoneAt(x: number, y: number): SnapZone | null {
  const { width, height } = workArea()
  const left = x <= EDGE
  const right = x >= width - EDGE
  if (left || right) {
    const side = left ? 'left' : 'right'
    if (y <= CORNER) return `top-${side}`
    if (y >= height - CORNER) return `bottom-${side}`
    return side
  }
  if (y <= EDGE) {
    if (x <= CORNER) return 'top-left'
    if (x >= width - CORNER) return 'top-right'
    return 'maximize'
  }
  return null
}

export function zoneRect(zone: SnapZone): Rect {
  const { width, height } = workArea()
  const halfWidth = Math.round(width / 2)
  const halfHeight = Math.round(height / 2)
  const left = { x: 0, width: halfWidth }
  const right = { x: halfWidth, width: width - halfWidth }
  const top = { y: 0, height: halfHeight }
  const bottom = { y: halfHeight, height: height - halfHeight }
  const full = { y: 0, height }

  switch (zone) {
    case 'left':
      return { ...left, ...full }
    case 'right':
      return { ...right, ...full }
    case 'top-left':
      return { ...left, ...top }
    case 'top-right':
      return { ...right, ...top }
    case 'bottom-left':
      return { ...left, ...bottom }
    case 'bottom-right':
      return { ...right, ...bottom }
    case 'maximize':
      return { x: 0, width, ...full }
  }
}

export const isSide = (zone: SnapZone): zone is SnapSide => zone === 'left' || zone === 'right'

export const oppositeSide = (side: SnapSide): SnapSide => (side === 'left' ? 'right' : 'left')

let preview: HTMLDivElement | null = null

/**
 * Shows where a dragged window will land, just underneath it. One element is
 * shared by every window, since only one can be dragged at a time.
 */
export function showPreview(zone: SnapZone | null, windowZIndex = 0) {
  if (!zone) {
    preview?.classList.remove('is-visible')
    return
  }
  if (!preview) {
    preview = document.createElement('div')
    preview.className = 'snap-preview'
    document.body.append(preview)
  }
  const rect = zoneRect(zone)
  Object.assign(preview.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: String(windowZIndex - 1),
  })
  preview.classList.add('is-visible')
}
