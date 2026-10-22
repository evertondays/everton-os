import {
  AppWindow,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus,
  Folder,
  FolderPlus,
  House,
  type LucideIcon,
  Monitor,
  Pencil,
  RotateCcw,
  Trash,
  Trash2,
} from 'lucide-react'
import { type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useState } from 'react'
import { type AnalyticsEvents, track } from '../../analytics.ts'
import { ContextMenu, type MenuItem, type MenuState } from '../../components/ContextMenu.tsx'
import { FileGlyph } from '../../components/FileGlyph.tsx'
import { NameField, RenameField } from '../../components/NameField.tsx'
import {
  type AppProps,
  DESKTOP_PATH,
  DROP_FOLDER_ATTRIBUTE,
  type Entry,
  FILE_DRAG_TYPE,
  LAUNCHER_MIME,
  TRASH_PATH,
  basename,
  canModify,
  draggedPaths,
  dirname,
  fsErrorMessage,
  isFileDrag,
  isInside,
  isOwn,
  joinPath,
  publicPath,
  showDragGhost,
  useAppWindow,
  useOS,
  usePointerDropFolder,
  useT,
} from '../../sdk/index.ts'
import { trackProjectResource } from './track.ts'

type FolderMethod = AnalyticsEvents['folder_opened']['method']

/** How long the copy button shows it worked (ms). */
const COPIED_TIMEOUT = 1500

export default function Files({ args }: AppProps) {
  const t = useT()
  const os = useOS()
  const appWindow = useAppWindow()
  os.fs.useWatch()
  const [path, setPath] = useState(args.files?.[0] ?? '/')
  const [history, setHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The address bar shows the path as text, to copy or type over, instead of the breadcrumb. */
  const [editingPath, setEditingPath] = useState(false)
  const [copied, setCopied] = useState(false)
  /** The folder that files dragged from a Files window would go into if dropped now. */
  const [dragTarget, setDropTarget] = useState<string | null>(null)
  // ...or desktop icons being dragged over this window.
  const pointerTarget = usePointerDropFolder()
  const dropTarget = dragTarget ?? pointerTarget

  // Fall back to the home folder if the path stops resolving.
  const found = os.fs.lookup(path)
  const here = found?.inode.kind === 'dir' ? found.path : '/'
  const inTrash = isInside(here, TRASH_PATH)
  const fullChain = os.fs.chain(here)
  // In the Trash, the path starts at the Trash, like trash:/// in a file manager.
  const chain = inTrash ? fullChain.slice(fullChain.findIndex((entry) => entry.path === TRASH_PATH)) : fullChain
  const current = chain.at(-1)!
  const items = os.fs.readdir(here)
  const mobile = os.shell === 'mobile'
  const writable = os.fs.canCreateIn(here)
  const selectedEntry = items.find((entry) => entry.name === selected) ?? null
  const trashHasItems = os.fs.readdir(TRASH_PATH).length > 0

  useEffect(() => {
    appWindow.setTitle(current.displayName)
  }, [appWindow, current.displayName])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_TIMEOUT)
    return () => window.clearTimeout(timer)
  }, [copied])

  const go = (to: string, method: FolderMethod) => {
    track('folder_opened', { path: publicPath(to), method })
    setHistory((list) => [...list, here])
    setPath(to)
    setSelected(null)
    setRenaming(null)
  }

  /** Runs a file operation, showing why if it's refused. */
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError(null)
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
    }
  }

  /** Goes to the path typed in the address bar: a folder opens here, a file in its app. */
  const submitPath = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const typed = String(new FormData(event.currentTarget).get('path') ?? '').trim()
    const target = os.fs.lookup(typed || '/', { cwd: here })
    if (!target) {
      setError(t('fs.error.notFound', { name: typed }))
      return
    }
    setError(null)
    setEditingPath(false)
    if (target.inode.kind === 'dir') {
      if (target.path !== here) go(target.path, 'address_bar')
    } else {
      void attempt(() => os.openFile(target.path, 'files'))
    }
  }

  /** The folder files dropped on `entry` go into: the folder itself, or the one a shortcut points to. */
  const folderOf = (entry: Entry): string | null => {
    const target = entry.inode.kind === 'symlink' ? os.fs.lookup(entry.path) : entry
    return target?.inode.kind === 'dir' ? target.path : null
  }

  /**
   * Drop handlers that put files dragged from a Files window into `folder`;
   * the Trash deletes them. The attribute lets desktop icons find it too.
   */
  const dropInto = (folder: string) => ({
    [DROP_FOLDER_ATTRIBUTE]: folder,
    onDragOver: (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      setDropTarget(folder)
    },
    onDragLeave: () => setDropTarget((target) => (target === folder ? null : target)),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setDropTarget(null)
      const paths = draggedPaths(event.dataTransfer)
      if (paths.length === 0) return
      void attempt(() => (folder === TRASH_PATH ? os.fs.trash(paths) : os.fs.move(paths, folder)))
      setSelected(null)
    },
  })

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(here)
      setCopied(true)
    } catch {
      // Clipboard blocked: the path is still selected in the field for Ctrl+C.
    }
  }

  const goBack = () => {
    const previous = history.at(-1)
    if (previous === undefined) return
    track('folder_opened', { path: publicPath(previous), method: 'back' })
    setHistory((list) => list.slice(0, -1))
    setPath(previous)
    setSelected(null)
    setRenaming(null)
  }

  const open = (entry: Entry, using?: string) => {
    trackProjectResource(entry, chain)
    const folder = using ? null : folderOf(entry)
    if (folder) go(folder, 'item')
    else void attempt(() => os.openFile(entry.path, 'files', { with: using }))
  }

  const create = (kind: 'file' | 'dir') =>
    attempt(async () => {
      const name = t(kind === 'dir' ? 'fs.newFolder' : 'fs.newFile')
      const created = basename(await os.fs.create(joinPath(here, name), { kind, unique: true }))
      setSelected(created)
      setRenaming(created)
    })

  const rename = (entry: Entry, name: string | null) => {
    setRenaming(null)
    if (name === null) return
    void attempt(async () => setSelected(basename(await os.fs.rename(entry.path, joinPath(here, name)))))
  }

  const remove = (entry: Entry) =>
    attempt(async () => {
      await os.fs.trash([entry.path])
      setSelected(null)
    })

  const restore = (entry: Entry) =>
    attempt(async () => {
      await os.fs.restore([entry.path])
      setSelected(null)
    })

  const purge = async (entry: Entry) => {
    const confirmed = await os.dialog.confirm({
      title: t('action.purge'),
      message: t('action.confirmPurge', { name: entry.displayName }),
      confirm: t('action.purge'),
      cancel: t('common.cancel'),
      danger: true,
    })
    if (!confirmed) return
    await attempt(async () => {
      await os.fs.remove([entry.path])
      setSelected(null)
    })
  }

  const empty = async () => {
    const confirmed = await os.dialog.confirm({
      title: t('action.emptyTrash'),
      message: t('action.confirmEmpty'),
      confirm: t('action.emptyTrash'),
      cancel: t('common.cancel'),
      danger: true,
    })
    if (confirmed) await attempt(() => os.fs.emptyTrash())
  }

  /** "Open with" entries: the apps besides the default one that open the file (or what a link points to). */
  const openWith = (entry: Entry): MenuItem[] => {
    const target = entry.inode.kind === 'symlink' ? os.fs.lookup(entry.path) : entry
    if (!target || target.inode.kind === 'dir' || target.mime === LAUNCHER_MIME) return []
    return os.apps
      .forMime(target.mime)
      .slice(1)
      .map((app) => ({
        label: t('action.openWith', { app: app.name }),
        icon: AppWindow,
        onSelect: () => open(entry, app.id),
      }))
  }

  const itemActions = (entry: Entry): MenuItem[] => {
    const own = canModify(entry)
    if (inTrash) {
      return own
        ? [
            { label: t('action.restore'), icon: RotateCcw, onSelect: () => void restore(entry) },
            { label: t('action.purge'), icon: Trash2, onSelect: () => void purge(entry), danger: true },
          ]
        : [{ label: t('action.open'), icon: ExternalLink, onSelect: () => open(entry) }]
    }
    return [
      { label: t('action.open'), icon: ExternalLink, onSelect: () => open(entry) },
      ...openWith(entry),
      ...(own
        ? [
            { label: t('action.rename'), icon: Pencil, onSelect: () => setRenaming(entry.name) },
            { label: t('action.delete'), icon: Trash2, onSelect: () => void remove(entry) },
          ]
        : []),
    ]
  }

  const folderActions = (): MenuItem[] => {
    if (inTrash) {
      return [{ label: t('action.emptyTrash'), icon: Trash2, onSelect: () => void empty(), disabled: !trashHasItems }]
    }
    if (!writable) return []
    return [
      { label: t('action.newFile'), icon: FilePlus, onSelect: () => void create('file') },
      { label: t('action.newFolder'), icon: FolderPlus, onSelect: () => void create('dir') },
    ]
  }

  const openMenu = (event: MouseEvent, entries: MenuItem[]) => {
    event.preventDefault()
    event.stopPropagation()
    if (entries.length > 0) setMenu({ x: event.clientX, y: event.clientY, items: entries })
  }

  const onGridKeyDown = (event: KeyboardEvent) => {
    if (!selectedEntry || !canModify(selectedEntry) || renaming) return
    if (event.key === 'Delete') {
      event.preventDefault()
      if (inTrash || event.shiftKey) void purge(selectedEntry)
      else void remove(selectedEntry)
    } else if (event.key === 'F2' && !inTrash) {
      event.preventDefault()
      setRenaming(selectedEntry.name)
    }
  }

  const places = [
    { path: '/', name: os.fs.displayName('/'), icon: House },
    ...os.fs
      .readdir('/')
      .filter((entry) => entry.inode.kind === 'dir')
      .map((entry) => ({ path: entry.path, name: entry.displayName, icon: entry.path === DESKTOP_PATH ? Monitor : Folder })),
    { path: TRASH_PATH, name: os.fs.displayName(TRASH_PATH), icon: Trash },
  ]

  const ownSelected = selectedEntry && canModify(selectedEntry)
  const upTo = inTrash && here === TRASH_PATH ? null : dirname(here)

  return (
    <div className="app files">
      <div className="toolbar">
        <button className="icon-button" onClick={goBack} disabled={history.length === 0} aria-label={t('common.back')}>
          <ArrowLeft size={17} />
        </button>
        <button
          className="icon-button"
          onClick={() => upTo && go(upTo, 'up')}
          disabled={here === '/' || upTo === null}
          aria-label={t('files.up')}
        >
          <ArrowUp size={17} />
        </button>
        {editingPath ? (
          <form className="address-bar" onSubmit={submitPath}>
            <NameField
              name="path"
              className="address-input"
              defaultValue={here}
              keepExtension={false}
              aria-label={t('files.path')}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditingPath(false)
              }}
              onBlur={() => setEditingPath(false)}
            />
            <button
              type="button"
              className="icon-button"
              // Keep the focus in the field, so copying doesn't close the bar.
              onMouseDown={(event) => event.preventDefault()}
              onClick={copyPath}
              aria-label={t('files.copyPath')}
              title={copied ? t('files.copied') : t('files.copyPath')}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </form>
        ) : (
          // A click on the current folder or the empty part of the bar shows the path as text, like a file manager.
          <nav
            className="breadcrumb"
            aria-label={t('files.path')}
            onClick={(event) => {
              if (event.target === event.currentTarget) setEditingPath(true)
            }}
          >
            {chain.map((entry, index) => {
              const last = index === chain.length - 1
              return (
                <span key={entry.path}>
                  {index > 0 && <ChevronRight size={14} />}
                  <button
                    aria-current={last ? 'page' : undefined}
                    className={dropTarget === entry.path ? 'is-drop-target' : undefined}
                    onClick={() => (last ? setEditingPath(true) : go(entry.path, 'breadcrumb'))}
                    {...(last ? {} : dropInto(entry.path))}
                  >
                    {entry.displayName}
                  </button>
                </span>
              )
            })}
          </nav>
        )}
        {inTrash ? (
          <>
            {ownSelected && (
              <>
                <ToolbarButton icon={RotateCcw} label={t('action.restore')} onClick={() => void restore(selectedEntry)} />
                <ToolbarButton icon={Trash2} label={t('action.purge')} onClick={() => void purge(selectedEntry)} />
              </>
            )}
            <button className="button" onClick={() => void empty()} disabled={!trashHasItems}>
              {t('action.emptyTrash')}
            </button>
          </>
        ) : (
          <>
            {ownSelected && (
              <>
                <ToolbarButton icon={Pencil} label={t('action.rename')} onClick={() => setRenaming(selectedEntry.name)} />
                <ToolbarButton icon={Trash2} label={t('action.delete')} onClick={() => void remove(selectedEntry)} />
              </>
            )}
            {writable && (
              <>
                <ToolbarButton icon={FilePlus} label={t('action.newFile')} onClick={() => void create('file')} />
                <ToolbarButton icon={FolderPlus} label={t('action.newFolder')} onClick={() => void create('dir')} />
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="app-error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      <div className="files-body">
        {!mobile && (
          <aside className="files-places">
            {places.map((place) => (
              <button
                key={place.path}
                className={`${place.path === here ? 'is-active' : ''}${dropTarget === place.path ? ' is-drop-target' : ''}`}
                onClick={() => place.path !== here && go(place.path, 'sidebar')}
                {...dropInto(place.path)}
              >
                <place.icon size={16} />
                {place.name}
              </button>
            ))}
          </aside>
        )}

        {items.length === 0 ? (
          <p
            className={`app-empty${dropTarget === here ? ' is-drop-target' : ''}`}
            onContextMenu={(event) => openMenu(event, folderActions())}
            {...dropInto(here)}
          >
            {t('files.empty')}
          </p>
        ) : (
          <ul
            className={`files-grid${dropTarget === here ? ' is-drop-target' : ''}`}
            {...dropInto(here)}
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelected(null)
            }}
            onContextMenu={(event) => openMenu(event, folderActions())}
            onKeyDown={onGridKeyDown}
          >
            {items.map((entry) => (
              <li key={entry.name}>
                {renaming === entry.name ? (
                  <div className="file is-selected">
                    <FileGlyph entry={entry} size={46} />
                    <RenameField
                      name={entry.name}
                      keepExtension={entry.inode.kind === 'file'}
                      onDone={(name) => rename(entry, name)}
                    />
                  </div>
                ) : (
                  <button
                    className={`file${selected === entry.name ? ' is-selected' : ''}${
                      dropTarget !== null && dropTarget === folderOf(entry) ? ' is-drop-target' : ''
                    }`}
                    // The visitor's own things can be dragged into folders, here, in another window or on the desktop.
                    draggable={!mobile && isOwn(entry)}
                    onDragStart={(event) => {
                      setSelected(entry.name)
                      event.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify([entry.path]))
                      event.dataTransfer.effectAllowed = 'move'
                      showDragGhost(event, event.currentTarget)
                    }}
                    {...(folderOf(entry) ? dropInto(folderOf(entry)!) : {})}
                    // A tap opens on the phone; on the desktop a click selects and a double click opens.
                    onClick={() => (mobile ? open(entry) : setSelected(entry.name))}
                    onDoubleClick={() => !mobile && open(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') open(entry)
                    }}
                    onFocus={() => !mobile && setSelected(entry.name)}
                    onContextMenu={(event) => {
                      setSelected(entry.name)
                      openMenu(event, itemActions(entry))
                    }}
                  >
                    <FileGlyph entry={entry} size={46} />
                    <span>{entry.displayName}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick(): void }) {
  return (
    <button className="icon-button" onClick={onClick} aria-label={label} title={label}>
      <Icon size={17} />
    </button>
  )
}
