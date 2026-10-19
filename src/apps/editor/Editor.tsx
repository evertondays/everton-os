import { CopyPlus, Save, Trash2 } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  type AppProps,
  DESKTOP_PATH,
  basename,
  canModify,
  dirname,
  fsErrorMessage,
  isInTrash,
  useAppWindow,
  useOS,
  useT,
} from '../../sdk/index.ts'

/**
 * A plain text editor, like Notepad. It edits the visitor's own files; the
 * résumé's Markdown opens read-only and can be saved as a copy. Opened
 * without a file, it starts an untitled one that goes where "Save as" says.
 */
export default function Editor({ args }: AppProps) {
  const t = useT()
  const os = useOS()
  const path = args.files?.[0] ?? null
  // Read once: a file that changes or disappears later (in another window) keeps its text here.
  const [start, setStart] = useState<{ text: string } | 'missing' | null>(() => (path === null ? { text: '' } : null))

  useEffect(() => {
    if (path === null) return
    let live = true
    os.fs.readFile(path).then(
      (content) => live && setStart(typeof content === 'string' ? { text: content } : 'missing'),
      () => live && setStart('missing'),
    )
    return () => {
      live = false
    }
  }, [os.fs, path])

  if (start === null) return <div className="app app-loading" />
  if (start === 'missing') return <div className="app app-empty">{t('viewer.notFound')}</div>
  return <EditorBody initialPath={path} initialText={start.text} />
}

const hasExtension = (name: string) => /\.[^.\s]+$/.test(name)

function EditorBody({ initialPath, initialText }: { initialPath: string | null; initialText: string }) {
  const t = useT()
  const os = useOS()
  const appWindow = useAppWindow()
  os.fs.useWatch()
  const [path, setPath] = useState(initialPath)
  const entry = path ? os.fs.lookup(path) : null
  const file = entry?.inode.kind === 'file' ? entry : null
  const [saved, setSaved] = useState(initialText)
  const [draft, setDraft] = useState(initialText)
  const [error, setError] = useState<string | null>(null)

  // The visitor's own files are saved in place; anything else (the résumé's, a shortcut) only as a copy.
  const own = file !== null && canModify(file) && !isInTrash(file.path)
  const readOnly = file !== null && !own
  const missing = path !== null && file === null
  const dirty = draft !== saved
  const name = file?.displayName ?? (path ? basename(path) : t('fs.untitled'))

  useEffect(() => {
    appWindow.setTitle(`${dirty ? '● ' : ''}${name}`)
  }, [appWindow, dirty, name])

  /** Runs a file operation, showing why if it's refused. Resolves with whether it went through. */
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError(null)
      return true
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
      return false
    }
  }

  /** Asks where to save (the system's Save dialog), then saves there. */
  const saveAs = async () => {
    // Next to the file when that folder takes new files, else on the desktop.
    const folder = own && os.fs.canCreateIn(dirname(file.path)) ? dirname(file.path) : DESKTOP_PATH
    const suggested = file && !own ? file.name : path ? basename(path) : t('fs.newFile')
    const chosen = await os.dialog.saveFile({ folder, name: suggested })
    if (!chosen) return false
    // A name without an extension is a text file.
    const target = hasExtension(basename(chosen)) ? chosen : `${chosen}.txt`
    return attempt(async () => {
      setPath(await os.fs.writeFile(target, draft))
      setSaved(draft)
    })
  }

  /** Saves in place; a file that has no place yet goes through "Save as" instead. */
  const save = () => {
    if (!own) return saveAs()
    return attempt(async () => {
      await os.fs.writeFile(path!, draft)
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
      const choice = await os.dialog.show({
        title: t('editor.unsavedTitle'),
        message: t('editor.unsaved', { name }),
        actions: [
          { value: 'discard', label: t('editor.discard'), danger: true },
          { value: 'cancel', label: t('common.cancel') },
          { value: 'save', label: t('editor.save'), primary: true },
        ],
      })
      if (choice === 'discard') return true
      return choice === 'save' && (await latestSave.current())
    })
    // Leaving the whole page can only be stopped by the browser's own prompt.
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      appWindow.setCloseGuard(null)
    }
  }, [appWindow, dirty, name, t, os.dialog])

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void (event.shiftKey ? saveAs() : save())
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
          <button className="button" onClick={() => void saveAs()}>
            <CopyPlus size={15} />
            {t('editor.saveCopy')}
          </button>
        ) : (
          <>
            {own && (
              <button
                className="icon-button"
                onClick={() => void attempt(() => os.fs.trash([path!]))}
                aria-label={t('action.delete')}
                title={t('action.delete')}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button className="button" onClick={() => void saveAs()}>
              {t('editor.saveAs')}
            </button>
            <button className="button is-primary" onClick={() => void save()} disabled={own && !dirty}>
              <Save size={15} />
              {t('editor.save')}
            </button>
          </>
        )}
      </div>

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
