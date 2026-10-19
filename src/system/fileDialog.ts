import { createStore } from './store.ts'
import { DESKTOP_PATH } from './vfs/vfs.ts'

// The system's Open and Save dialogs. Apps await them (os.dialog.openFile and
// saveFile); <FileDialogHost> draws them one at a time, like dialog.ts.

export interface FileDialogRequest {
  id: number
  mode: 'open' | 'save'
  /** Folder it starts in. */
  folder: string
  /** Name it suggests (save). */
  name: string
  /** Resolves with the chosen path, or null when dismissed. */
  resolve(path: string | null): void
}

export const fileDialogs = createStore<{ queue: FileDialogRequest[] }>({ queue: [] })

let sequence = 0

function ask(mode: FileDialogRequest['mode'], folder: string, name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request: FileDialogRequest = {
      id: ++sequence,
      mode,
      folder,
      name,
      resolve(path) {
        fileDialogs.set((state) => ({ queue: state.queue.filter((other) => other !== request) }))
        resolve(path)
      },
    }
    fileDialogs.set((state) => ({ queue: [...state.queue, request] }))
  })
}

/** Asks for a file to open. */
export const openFileDialog = (options: { folder?: string } = {}) => ask('open', options.folder ?? DESKTOP_PATH, '')

/** Asks where to save, suggesting `name` in `folder`. The path may be of a file that exists (the dialog asked to replace it). */
export const saveFileDialog = (options: { folder?: string; name?: string } = {}) =>
  ask('save', options.folder ?? DESKTOP_PATH, options.name ?? '')
