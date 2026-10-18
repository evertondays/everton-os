import { type RefObject, useEffect, useRef, useState } from 'react'
import WinBox from 'winbox/src/js/winbox.js'
import 'winbox/dist/css/winbox.min.css'
import { type SnapZone, showPreview, zoneAt, zoneRect } from './snap.ts'

// The only file that knows about WinBox. Everything else talks to this hook,
// so the library can be forked or swapped without touching the shell or the apps.

export interface WindowOptions {
  title: string
  width: number
  height: number
  x: number
  y: number
  /** Space reserved at the bottom of the screen (the panel). */
  bottom: number
  /** The user asked to close the window. Unmount the component to actually close it. */
  onClose(): void
  onFocus(): void
  onBlur(): void
  onMinimize(): void
  onRestore(): void
  /** The user dragged the window into a snap zone and it now fills it. */
  onSnap(zone: SnapZone): void
}

export interface WindowHandle {
  focus(): void
  minimize(): void
  /** Brings a minimized window back. */
  restore(): void
  setTitle(title: string): void
  snap(zone: SnapZone): void
}

/** Drag distance (px) before a press on the title bar counts as a drag. */
const DRAG_THRESHOLD = 4

/**
 * Adds Windows-style snapping to a window: dragging its title bar into a zone
 * (see snap.ts) previews the target and drops the window into it on release.
 * Dragging a snapped window out gives it back the size it had before.
 */
function enableSnapping(box: WinBox, onSnap: (zone: SnapZone) => void) {
  // Set while the window fills a half or a quarter. Maximizing is left to
  // WinBox, which already restores the size when a maximized window is dragged.
  let snapped: { zone: SnapZone; restore: { width: number; height: number } } | null = null

  const snap = (zone: SnapZone) => {
    if (zone === 'maximize') {
      if (snapped) box.resize(snapped.restore.width, snapped.restore.height)
      snapped = null
      box.maximize()
      return
    }
    if (box.max) box.restore()
    snapped = { zone, restore: snapped?.restore ?? { width: box.width, height: box.height } }
    const rect = zoneRect(zone)
    box.resize(rect.width, rect.height).move(rect.x, rect.y)
  }

  const onTitleBarDown = (down: MouseEvent) => {
    if (down.button !== 0 || box.min) return
    let dragging = false
    let zone: SnapZone | null = null

    // WinBox moves the window from its own capture listeners on `window`, and
    // stops propagation there; ours are on `window` too, in the same phase.
    const onMove = (move: MouseEvent) => {
      if (!dragging) {
        if (Math.abs(move.clientX - down.clientX) + Math.abs(move.clientY - down.clientY) < DRAG_THRESHOLD) return
        dragging = true
        if (snapped) {
          // Keep the cursor at the same relative spot of the title bar while the window shrinks back.
          const ratio = Math.min(0.9, Math.max(0.1, (down.clientX - box.x) / box.width))
          const { width, height } = snapped.restore
          snapped = null
          box.resize(width, height).move(Math.round(move.clientX - ratio * width), box.y)
        }
      }
      zone = zoneAt(move.clientX, move.clientY)
      showPreview(zone, Number(box.window.style.zIndex))
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      showPreview(null)
      if (dragging && zone) {
        snap(zone)
        onSnap(zone)
      }
    }

    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
  }

  // A snapped window follows the screen when the browser is resized.
  const onResize = () => {
    if (!snapped) return
    const rect = zoneRect(snapped.zone)
    box.resize(rect.width, rect.height).move(rect.x, rect.y)
  }

  // Capture, like WinBox's own listener here: it stops the event before it
  // reaches the title text, so a bubbling listener would never hear it.
  const titleBar = box.window.querySelector<HTMLElement>('.wb-drag')
  titleBar?.addEventListener('mousedown', onTitleBarDown, true)
  window.addEventListener('resize', onResize)

  return {
    snap,
    dispose() {
      titleBar?.removeEventListener('mousedown', onTitleBarDown, true)
      window.removeEventListener('resize', onResize)
    },
  }
}

/**
 * Creates a window for the lifetime of the component. Render the content into
 * `container` with a portal; it is null until the window exists.
 */
export function useWindow(options: WindowOptions): {
  container: HTMLElement | null
  handle: RefObject<WindowHandle | null>
} {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const handle = useRef<WindowHandle | null>(null)
  const latest = useRef(options)

  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    const initial = latest.current
    const mount = document.createElement('div')
    mount.className = 'eos-window-content'
    let disposed = false

    const box = new WinBox({
      title: initial.title,
      mount,
      class: ['eos-window', 'no-full'],
      header: 40,
      width: initial.width,
      height: initial.height,
      minwidth: 300,
      minheight: 200,
      x: initial.x,
      y: initial.y,
      bottom: initial.bottom,
      // WinBox asks before closing. While the component is mounted we veto and
      // let React drive: the owner unmounts us, and the cleanup below closes for real.
      onclose: () => {
        if (disposed) return false
        latest.current.onClose()
        return true
      },
      onfocus: () => latest.current.onFocus(),
      onblur: () => latest.current.onBlur(),
      onminimize: () => latest.current.onMinimize(),
      onrestore: () => latest.current.onRestore(),
    })

    const snapping = enableSnapping(box, (zone) => latest.current.onSnap(zone))

    handle.current = {
      focus: () => box.focus(),
      minimize: () => box.minimize(),
      restore: () => {
        if (box.min) box.restore()
      },
      setTitle: (title) => box.setTitle(title),
      snap: (zone) => {
        if (box.min) box.restore()
        snapping.snap(zone)
      },
    }
    // The window is an external object: its container only exists once the effect has run.
    // oxlint-disable-next-line react/set-state-in-effect
    setContainer(mount)

    return () => {
      disposed = true
      handle.current = null
      snapping.dispose()
      box.close(true)
    }
  }, [])

  useEffect(() => {
    handle.current?.setTitle(options.title)
  }, [container, options.title])

  return { container, handle }
}
