import type { LucideIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// A right-click menu, shared by the desktop and the Files app. It opens where
// the pointer was, stays on screen, and closes on Escape or a click elsewhere.

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect(): void
  disabled?: boolean
  danger?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const latestClose = useRef(onClose)

  useEffect(() => {
    latestClose.current = onClose
  })

  // Measured before paint, so a menu opened near an edge never shows past it.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    element.style.left = `${Math.max(4, Math.min(menu.x, window.innerWidth - width - 4))}px`
    element.style.top = `${Math.max(4, Math.min(menu.y, window.innerHeight - height - 4))}px`
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [menu])

  useEffect(() => {
    const close = () => latestClose.current()
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Escape') onClose()
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    buttons.at((index + step) % buttons.length)?.focus()
  }

  return createPortal(
    <div
      className="context-menu"
      role="menu"
      ref={ref}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={item.danger ? 'is-danger' : undefined}
          disabled={item.disabled}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          {item.icon ? <item.icon size={15} /> : <span className="context-menu-gap" />}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
