import { type KeyboardEvent, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { type DialogRequest, dialogs } from '../system/dialog.ts'
import { useStore } from '../system/store.ts'

/** Draws the oldest pending dialog of system/dialog.ts over the whole screen. */
export function DialogHost() {
  const request = useStore(dialogs, (state) => state.queue[0] ?? null)
  if (!request) return null
  return <Dialog key={request.id} request={request} />
}

function Dialog({ request }: { request: DialogRequest }) {
  const box = useRef<HTMLDivElement>(null)

  // Focus the default button, and give focus back to where it was once the dialog is gone.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const buttons = box.current?.querySelectorAll<HTMLButtonElement>('button')
    ;(box.current?.querySelector<HTMLButtonElement>('button.is-primary') ?? buttons?.[buttons.length - 1])?.focus()
    return () => previous?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    // Nothing behind the dialog hears the keyboard while it's open.
    event.stopPropagation()
    if (event.key === 'Escape') request.resolve(null)
    if (event.key !== 'Tab') return
    // Keep Tab cycling through the dialog's buttons.
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    event.preventDefault()
    buttons.at((index + (event.shiftKey ? -1 : 1)) % buttons.length)?.focus()
  }

  return createPortal(
    <div className="dialog-backdrop" onKeyDown={onKeyDown}>
      <div
        className="dialog"
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dialog-${request.id}-title`}
        aria-describedby={`dialog-${request.id}-message`}
      >
        <h2 id={`dialog-${request.id}-title`}>{request.title}</h2>
        <p id={`dialog-${request.id}-message`}>{request.message}</p>
        <div className="dialog-actions">
          {request.actions.map((action) => (
            <button
              key={action.value}
              className={`button${action.primary ? ' is-primary' : ''}${action.danger ? ' is-danger' : ''}`}
              onClick={() => request.resolve(action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
