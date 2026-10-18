import { CopyPlus, Save, Trash2 } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { NameField } from '../components/NameField.tsx'
import { useT } from '../i18n/index.ts'
import type { AppProps } from '../system/apps.ts'
import { showDialog } from '../system/dialog.ts'
import { canCreateIn, createNode, fsErrorMessage, trashNodes, writeFile } from '../system/fileOps.ts'
import { DESKTOP_PATH, chainPath, splitPath, useFs, walk } from '../system/fs.ts'
import { useAppWindow } from '../system/os.ts'

/**
 * A plain text editor, like Notepad. It edits the visitor's own files; the
 * résumé's Markdown opens read-only and can be saved as a copy. Opened
 * without a file, it starts an untitled one that goes to the desktop when saved.
 */
export default function Editor({ args }: AppProps) {
  const t = useT()
  const fs = useFs()
  const appWindow = useAppWindow()
  const [path, setPath] = useState<string | null>(args?.path ?? null)
  const chain = path ? walk(fs, path) : null
  const node = chain?.at(-1)
  const file = node?.kind === 'file' ? node : null
  // Decided once: a file that disappears later (deleted in another window) keeps its text here.
  const [opened] = useState(() => path === null || file?.type === 'text' || file?.type === 'markdown')
  const [saved, setSaved] = useState(() => file?.content ?? '')
  const [draft, setDraft] = useState(saved)
  /** The name typed in the "Save as" bar, while it's open. */
  const [naming, setNaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const own = file?.key !== undefined
  const readOnly = file !== null && !own
  const missing = path !== null && file === null
  const dirty = draft !== saved
  const name = file?.name ?? (path ? splitPath(path)[1] : t('fs.untitled'))
  // "Save as" goes next to the file when that folder takes new files, else to the desktop.
  const parent = chain && own ? splitPath(chainPath(chain))[0] : DESKTOP_PATH
  const target = canCreateIn(parent) ? parent : DESKTOP_PATH
  const targetName = walk(fs, target)?.at(-1)?.name ?? ''

  useEffect(() => {
    appWindow.setTitle(`${dirty ? '● ' : ''}${name}`)
  }, [appWindow, dirty, name])

  /** Runs a file operation, showing why if it's refused. True if it went through. */
  const attempt = (action: () => void) => {
    try {
      action()
      setError(null)
      return true
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
      return false
    }
  }

  const askName = () => setNaming(file && !own ? file.name : path ? name : t('fs.newFile'))

  /** Saves in place; a file that has no place yet opens "Save as" instead (and counts as not saved). */
  const save = () => {
    if (!own) {
      askName()
      return false
    }
    return attempt(() => {
      writeFile(path!, draft)
      setSaved(draft)
    })
  }

  // The close guard below outlives renders; it saves with the latest text.
  const latestSave = useRef(save)

  useEffect(() => {
    latestSave.current = save
  })

  // Closing with unsaved changes asks in a system dialog: save, don't save, or stay.
  useEffect(() => {
    if (!dirty) return
    appWindow.setCloseGuard(async () => {
      const choice = await showDialog({
        title: t('editor.unsavedTitle'),
        message: t('editor.unsaved', { name }),
        actions: [
          { value: 'discard', label: t('editor.discard'), danger: true },
          { value: 'cancel', label: t('common.cancel') },
          { value: 'save', label: t('editor.save'), primary: true },
        ],
      })
      if (choice === 'discard') return true
      return choice === 'save' && latestSave.current()
    })
    // Leaving the whole page can only be stopped by the browser's own prompt.
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      appWindow.setCloseGuard(null)
    }
  }, [appWindow, dirty, name, t])

  if (!opened) return <div className="app app-empty">{t('viewer.notFound')}</div>

  const saveAs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const typed = String(new FormData(event.currentTarget).get('name') ?? '')
    attempt(() => {
      const created = createNode(target, 'file', typed, 'editor', { unique: false, content: draft })
      setPath(created.path)
      setSaved(draft)
      setNaming(null)
    })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (event.shiftKey) askName()
      else save()
    }
  }

  return (
    <div className="app editor" onKeyDown={onKeyDown}>
      <div className="toolbar">
        <span className="toolbar-title">
          {name}
          {readOnly && <span className="editor-badge">{t('editor.readOnly')}</span>}
        </span>
        {readOnly ? (
          <button className="button" onClick={askName}>
            <CopyPlus size={15} />
            {t('editor.saveCopy')}
          </button>
        ) : (
          <>
            {own && (
              <button
                className="icon-button"
                onClick={() => attempt(() => trashNodes([path!], 'editor'))}
                aria-label={t('action.delete')}
                title={t('action.delete')}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button className="button" onClick={askName} disabled={naming !== null}>
              {t('editor.saveAs')}
            </button>
            <button className="button is-primary" onClick={save} disabled={own && !dirty}>
              <Save size={15} />
              {t('editor.save')}
            </button>
          </>
        )}
      </div>

      {naming !== null && (
        <form className="editor-bar" onSubmit={saveAs}>
          <label htmlFor="editor-name">{t('editor.saveIn', { folder: targetName })}</label>
          <NameField
            id="editor-name"
            name="name"
            className="input"
            defaultValue={naming}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNaming(null)
            }}
            aria-label={t('editor.name')}
          />
          <button type="button" className="button" onClick={() => setNaming(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="button is-primary">
            {t('editor.save')}
          </button>
        </form>
      )}

      {missing && <p className="editor-bar is-warning">{t('editor.missing')}</p>}
      {error && (
        <p className="editor-bar is-error" role="alert">
          {error}
        </p>
      )}

      <textarea
        className="editor-text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        readOnly={readOnly}
        autoFocus
        spellCheck={false}
        aria-label={name}
      />

      <div className="editor-status">
        <span>{t('editor.stats', { lines: draft.split('\n').length, chars: draft.length })}</span>
        <span>UTF-8</span>
      </div>
    </div>
  )
}
