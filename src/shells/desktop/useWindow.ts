import { type RefObject, useEffect, useRef, useState } from 'react'
import WinBox from 'winbox/src/js/winbox.js'
import 'winbox/dist/css/winbox.min.css'

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
}

export interface WindowHandle {
  focus(): void
  minimize(): void
  /** Brings a minimized window back. */
  restore(): void
  setTitle(title: string): void
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

    handle.current = {
      focus: () => box.focus(),
      minimize: () => box.minimize(),
      restore: () => {
        if (box.min) box.restore()
      },
      setTitle: (title) => box.setTitle(title),
    }
    // The window is an external object: its container only exists once the effect has run.
    // oxlint-disable-next-line react/set-state-in-effect
    setContainer(mount)

    return () => {
      disposed = true
      handle.current = null
      box.close(true)
    }
  }, [])

  useEffect(() => {
    handle.current?.setTitle(options.title)
  }, [container, options.title])

  return { container, handle }
}
