import { type InputHTMLAttributes, useEffect, useRef } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue'> & {
  defaultValue: string
  /** Leave the extension out of the selection, so typing replaces just the name. */
  keepExtension?: boolean
}

/** A field for a file name that focuses itself and selects the name, like a file manager. */
export function NameField({ defaultValue, keepExtension = true, ...props }: Props) {
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.focus()
    const dot = keepExtension ? element.value.lastIndexOf('.') : -1
    element.setSelectionRange(0, dot > 0 ? dot : element.value.length)
  }, [keepExtension])

  return <input ref={field} defaultValue={defaultValue} spellCheck={false} autoComplete="off" {...props} />
}

/** A NameField that renames in place: Enter or leaving it commits, Escape cancels (null). */
export function RenameField({
  name,
  keepExtension,
  onDone,
}: {
  name: string
  keepExtension: boolean
  onDone(name: string | null): void
}) {
  const done = useRef(false)
  const finish = (value: string | null) => {
    if (done.current) return
    done.current = true
    onDone(value)
  }

  return (
    <NameField
      className="rename-field"
      defaultValue={name}
      keepExtension={keepExtension}
      onKeyDown={(event) => {
        // Keep Enter, Delete, Ctrl+A... for the text, away from the file manager around it.
        event.stopPropagation()
        if (event.key === 'Enter') finish(event.currentTarget.value)
        if (event.key === 'Escape') finish(null)
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
