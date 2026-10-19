import { ArrowUp, ChevronRight } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileGlyph } from '../components/FileGlyph.tsx'
import { NameField } from '../components/NameField.tsx'
import { useT } from '../i18n/index.ts'
import { confirmDialog } from '../system/dialog.ts'
import { type FileDialogRequest, fileDialogs } from '../system/fileDialog.ts'
import { useFsReady, useFsVersion, vfs } from '../system/fs.ts'
import { useStore } from '../system/store.ts'
import { joinPath, splitPath } from '../system/vfs/path.ts'
import { DESKTOP_PATH, type Entry } from '../system/vfs/vfs.ts'

/** Draws the oldest pending Open or Save dialog of system/fileDialog.ts: a small Files in a modal. */
export function FileDialogHost() {
  const request = useStore(fileDialogs, (state) => state.queue[0] ?? null)
  const ready = useFsReady()
  if (!request || !ready) return null
  return <FileDialog key={request.id} request={request} />
}

function FileDialog({ request }: { request: FileDialogRequest }) {
  const t = useT()
  useFsVersion()
  const save = request.mode === 'save'
  const [path, setPath] = useState(() => {
    const start = vfs.lookup(request.folder)
    return start?.inode.kind === 'dir' ? start.path : DESKTOP_PATH
  })
  const [name, setName] = useState(request.name)
  const [selected, setSelected] = useState<string | null>(null)
  /** Bumped when a click puts a file's name in the name field. */
  const [picked, setPicked] = useState(0)
  // The folder may have gone in the meantime (deleted in a window behind).
  const folder = vfs.lookup(path)?.inode.kind === 'dir' ? path : DESKTOP_PATH
  const chain = vfs.chain(folder)
  const entries = vfs.readdir(folder)
  const writable = vfs.canCreateIn(folder)
  const title = t(save ? 'dialog.saveTitle' : 'dialog.openTitle')

  const go = (to: string) => {
    setPath(to)
    setSelected(null)
  }

  /** Opens a folder, or picks a file: to open it, or to save over it (after asking). */
  const pick = async (entry: Entry) => {
    const target = entry.inode.kind === 'symlink' ? vfs.lookup(entry.path) : entry
    if (!target) return
    if (target.inode.kind === 'dir') {
      go(target.path)
      return
    }
    if (!save) {
      request.resolve(target.path)
      return
    }
    const replace = await confirmDialog({
      title: t('dialog.replaceTitle', { name: entry.displayName }),
      message: t('dialog.replace'),
      confirm: t('dialog.replaceConfirm'),
      cancel: t('common.cancel'),
      danger: true,
    })
    if (replace) request.resolve(target.path)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!save) {
      const entry = entries.find((other) => other.name === selected)
      if (entry) void pick(entry)
      return
    }
    const clean = name.trim()
    if (!clean || !writable) return
    const existing = entries.find((entry) => entry.name.toLowerCase() === clean.toLowerCase())
    if (existing) void pick(existing)
    else request.resolve(joinPath(folder, clean))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Nothing behind the dialog hears the keyboard while it's open.
    event.stopPropagation()
    if (event.key === 'Escape') request.resolve(null)
  }

  return createPortal(
    <div className="dialog-backdrop" onKeyDown={onKeyDown}>
      <form className="dialog file-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <h2>{title}</h2>
        <div className="toolbar">
          <button
            type="button"
            className="icon-button"
            onClick={() => go(splitPath(folder)[0])}
            disabled={folder === '/'}
            aria-label={t('files.up')}
          >
            <ArrowUp size={17} />
          </button>
          <nav className="breadcrumb" aria-label={t('files.path')}>
            {chain.map((entry, index) => (
              <span key={entry.path}>
                {index > 0 && <ChevronRight size={14} />}
                <button
                  type="button"
                  aria-current={index === chain.length - 1 ? 'page' : undefined}
                  onClick={() => go(entry.path)}
                >
                  {entry.displayName}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <ul className="files-grid file-dialog-list">
          {entries.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                className={`file${selected === entry.name ? ' is-selected' : ''}`}
                onClick={() => {
                  setSelected(entry.name)
                  if (save && entry.inode.kind === 'file') {
                    setName(entry.name)
                    setPicked((count) => count + 1)
                  }
                }}
                onDoubleClick={() => void pick(entry)}
              >
                <FileGlyph entry={entry} size={36} />
                <span>{entry.displayName}</span>
              </button>
            </li>
          ))}
          {entries.length === 0 && <li className="file-dialog-empty">{t('files.empty')}</li>}
        </ul>
        {save && (
          <label className="file-dialog-name">
            <span>{t('dialog.name')}</span>
            <NameField
              className="input"
              defaultValue={name}
              // Clicking a file puts its name in the field (a new field, with the name selected).
              key={picked}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => request.resolve(null)}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="button is-primary"
            disabled={save ? !writable || !name.trim() : selected === null}
          >
            {t(save ? 'dialog.save' : 'dialog.open')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
