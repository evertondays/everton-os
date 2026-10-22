import { type ReactNode, useEffect, useRef } from 'react'
import type { MenuItem } from './ContextMenu.tsx'

// The phone's answer to a right-click menu: a sheet of actions that slides up
// from the bottom, over a dimmed screen. A tap outside or Escape closes it.

export function ActionSheet({
  header,
  items,
  onClose,
}: {
  /** What the actions are about: an icon and a name, usually. */
  header?: ReactNode
  items: MenuItem[]
  onClose(): void
}) {
  const latestClose = useRef(onClose)

  useEffect(() => {
    latestClose.current = onClose
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestClose.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="action-sheet" onClick={onClose}>
      <div className="action-sheet-panel" role="menu" onClick={(event) => event.stopPropagation()}>
        <span className="action-sheet-grabber" aria-hidden />
        {header && <div className="action-sheet-header">{header}</div>}
        {items.map((item) => (
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
            {item.icon && <item.icon size={20} />}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
