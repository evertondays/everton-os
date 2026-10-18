import { createStore } from './store.ts'

// The system's own dialogs, drawn over everything like an OS alert instead of
// the browser's confirm(). Apps await showDialog; <DialogHost> (App.tsx) draws
// them one at a time, in the order they were asked.

export interface DialogAction<V extends string = string> {
  value: V
  label: string
  /** The default button: focused when the dialog opens, so Enter picks it. */
  primary?: boolean
  danger?: boolean
}

export interface DialogRequest {
  id: number
  title: string
  message: string
  actions: DialogAction[]
  /** Closes the dialog with the value of the button picked, or null when dismissed. */
  resolve(value: string | null): void
}

export const dialogs = createStore<{ queue: DialogRequest[] }>({ queue: [] })

let sequence = 0

/** Shows a dialog and resolves with the value of the button picked, or null if it was dismissed (Escape). */
export function showDialog<V extends string>(options: {
  title: string
  message: string
  actions: DialogAction<V>[]
}): Promise<V | null> {
  return new Promise((resolve) => {
    const request: DialogRequest = {
      id: ++sequence,
      ...options,
      resolve(value) {
        dialogs.set((state) => ({ queue: state.queue.filter((other) => other !== request) }))
        resolve(value as V | null)
      },
    }
    dialogs.set((state) => ({ queue: [...state.queue, request] }))
  })
}

/** A question with Cancel and one other button: true if the visitor picked the other one. */
export async function confirmDialog(options: {
  title: string
  message: string
  confirm: string
  cancel: string
  danger?: boolean
}): Promise<boolean> {
  const choice = await showDialog({
    title: options.title,
    message: options.message,
    actions: [
      { value: 'cancel', label: options.cancel },
      { value: 'confirm', label: options.confirm, primary: true, danger: options.danger },
    ],
  })
  return choice === 'confirm'
}
