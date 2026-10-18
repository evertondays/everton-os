import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus,
  FileText,
  FileUser,
  Folder,
  FolderPlus,
  Globe,
  House,
  type LucideIcon,
  Monitor,
  Pencil,
  RotateCcw,
  Trash,
  Trash2,
} from 'lucide-react'
import { type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useState } from 'react'
import { type AnalyticsEvents, track } from '../analytics.ts'
import { AppIcon } from '../components/AppIcon.tsx'
import { ContextMenu, type MenuItem, type MenuState } from '../components/ContextMenu.tsx'
import { NameField, RenameField } from '../components/NameField.tsx'
import { useT } from '../i18n/index.ts'
import { type AppProps, shortcutIcons } from '../system/apps.ts'
import { confirmDialog } from '../system/dialog.ts'
import {
  FILE_DRAG_TYPE,
  canCreateIn,
  canModify,
  createNode,
  draggedPaths,
  emptyTrash,
  fsErrorMessage,
  isFileDrag,
  isUserNode,
  moveNodes,
  purgeNodes,
  renameNode,
  restoreNodes,
  trashNodes,
} from '../system/fileOps.ts'
import {
  DESKTOP_PATH,
  type FsNode,
  PROJECTS_PATH,
  TRASH_PATH,
  chainPath,
  childPath,
  publicPath,
  shortcutTarget,
  splitPath,
  useFs,
  visibleChildren,
  walk,
} from '../system/fs.ts'
import { openNode, useAppWindow, useOS } from '../system/os.ts'
import { isInside } from '../system/userFs.ts'

type FolderMethod = AnalyticsEvents['folder_opened']['method']

/** How long the copy button shows it worked (ms). */
const COPIED_TIMEOUT = 1500

function NodeIcon({ node, size }: { node: FsNode; size: number }) {
  if (node.kind === 'dir') return <Folder className="file-icon is-folder" size={size} strokeWidth={1.5} />
  if (node.type === 'image') return <img className="file-thumbnail" src={node.src} alt="" style={{ height: size }} />
  if (node.type === 'resume') return <FileUser className="file-icon is-resume" size={size} strokeWidth={1.5} />
  if (node.type === 'link') return <Globe className="file-icon is-link" size={size} strokeWidth={1.5} />
  if (node.type === 'text') return <FileText className="file-icon is-text" size={size} strokeWidth={1.5} />
  if (node.shortcut) return <AppIcon app={shortcutIcons[node.shortcut]} size={size - 6} />
  return <FileText className="file-icon" size={size} strokeWidth={1.5} />
}

export default function Files({ args }: AppProps) {
  const t = useT()
  const fs = useFs()
  const os = useOS()
  const appWindow = useAppWindow()
  const [path, setPath] = useState(args?.path ?? '/')
  const [history, setHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The address bar shows the path as text, to copy or type over, instead of the breadcrumb. */
  const [editingPath, setEditingPath] = useState(false)
  const [copied, setCopied] = useState(false)
  /** The folder that files being dragged would go into if dropped now. */
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Fall back to the home folder if the path stops resolving.
  const found = walk(fs, path)
  const chain = found && found.at(-1)!.kind === 'dir' ? found : [fs]
  const current = chain.at(-1)!
  const here = chainPath(chain)
  const items = current.kind === 'dir' ? visibleChildren(current) : []
  const mobile = os.shell === 'mobile'
  const inTrash = isInside(here, TRASH_PATH)
  const writable = canCreateIn(here)
  const selectedNode = items.find((node) => node.id === selected) ?? null
  const trash = walk(fs, TRASH_PATH)?.at(-1)
  const trashHasOwn = trash?.kind === 'dir' && trash.children.some(isUserNode)

  useEffect(() => {
    appWindow.setTitle(current.name)
  }, [appWindow, current.name])

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

  /** Goes to the path typed in the address bar: a folder opens here, a file in its app. */
  const submitPath = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const typed = String(new FormData(event.currentTarget).get('path') ?? '').trim()
    const target = walk(fs, typed || '/', here)
    if (!target) {
      setError(t('fs.error.notFound', { name: typed }))
      return
    }
    setError(null)
    setEditingPath(false)
    const node = target.at(-1)!
    const to = chainPath(target)
    if (node.kind === 'dir') {
      if (to !== here) go(to, 'address_bar')
    } else {
      openNode(os, node, to, 'files')
    }
  }

  /** The folder files dropped on `node` go into: the folder itself, or the one a shortcut points to. */
  const folderOf = (node: FsNode): string | null => {
    if (node.kind === 'dir') return childPath(here, node)
    const target = shortcutTarget(fs, node)
    return target && 'chain' in target && target.chain.at(-1)!.kind === 'dir' ? chainPath(target.chain) : null
  }

  /** Drop handlers that put files dragged from a Files window into `folder`; the Trash deletes them. */
  const dropInto = (folder: string) => ({
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
      attempt(() => (folder === TRASH_PATH ? trashNodes(paths, 'files') : moveNodes(paths, folder, 'files')))
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

  const open = (node: FsNode) => {
    const target = childPath(here, node)
    // Only the résumé's own projects: what visitors make in there is theirs, and so are its names.
    if (target.startsWith(`${PROJECTS_PATH}/`) && !isUserNode(node) && !chain.some(isUserNode)) {
      track('project_resource_opened', {
        project: target.split('/')[2],
        resource: node.id,
        resource_type: node.kind === 'dir' ? 'project' : node.type,
      })
    }
    if (node.kind === 'dir') go(target, 'item')
    else openNode(os, node, target, 'files')
  }

  /** Runs a file operation, showing why if it's refused. */
  const attempt = (action: () => void) => {
    try {
      action()
      setError(null)
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
    }
  }

  const create = (kind: 'file' | 'dir') =>
    attempt(() => {
      const created = createNode(here, kind, t(kind === 'dir' ? 'fs.newFolder' : 'fs.newFile'), 'files')
      const id = splitPath(created.path)[1]
      setSelected(id)
      setRenaming(id)
    })

  const rename = (node: FsNode, name: string | null) => {
    setRenaming(null)
    if (name === null) return
    attempt(() => setSelected(splitPath(renameNode(childPath(here, node), name))[1]))
  }

  const remove = (node: FsNode) =>
    attempt(() => {
      trashNodes([childPath(here, node)], 'files')
      setSelected(null)
    })

  const restore = (node: FsNode) =>
    attempt(() => {
      restoreNodes([childPath(here, node)])
      setSelected(null)
    })

  const purge = async (node: FsNode) => {
    const confirmed = await confirmDialog({
      title: t('action.purge'),
      message: t('action.confirmPurge', { name: node.name }),
      confirm: t('action.purge'),
      cancel: t('common.cancel'),
      danger: true,
    })
    if (!confirmed) return
    attempt(() => {
      purgeNodes([childPath(here, node)], 'files')
      setSelected(null)
    })
  }

  const empty = async () => {
    const confirmed = await confirmDialog({
      title: t('action.emptyTrash'),
      message: t('action.confirmEmpty'),
      confirm: t('action.emptyTrash'),
      cancel: t('common.cancel'),
      danger: true,
    })
    if (confirmed) attempt(emptyTrash)
  }

  const itemActions = (node: FsNode): MenuItem[] => {
    const own = canModify(node)
    if (inTrash) {
      return own
        ? [
            { label: t('action.restore'), icon: RotateCcw, onSelect: () => restore(node) },
            { label: t('action.purge'), icon: Trash2, onSelect: () => purge(node), danger: true },
          ]
        : [{ label: t('action.open'), icon: ExternalLink, onSelect: () => open(node) }]
    }
    return [
      { label: t('action.open'), icon: ExternalLink, onSelect: () => open(node) },
      ...(own
        ? [
            { label: t('action.rename'), icon: Pencil, onSelect: () => setRenaming(node.id) },
            { label: t('action.delete'), icon: Trash2, onSelect: () => remove(node) },
          ]
        : []),
    ]
  }

  const folderActions = (): MenuItem[] => {
    if (inTrash) return [{ label: t('action.emptyTrash'), icon: Trash2, onSelect: empty, disabled: !trashHasOwn }]
    if (!writable) return []
    return [
      { label: t('action.newFile'), icon: FilePlus, onSelect: () => create('file') },
      { label: t('action.newFolder'), icon: FolderPlus, onSelect: () => create('dir') },
    ]
  }

  const openMenu = (event: MouseEvent, entries: MenuItem[]) => {
    event.preventDefault()
    event.stopPropagation()
    if (entries.length > 0) setMenu({ x: event.clientX, y: event.clientY, items: entries })
  }

  const onGridKeyDown = (event: KeyboardEvent) => {
    if (!selectedNode || !canModify(selectedNode) || renaming) return
    if (event.key === 'Delete') {
      event.preventDefault()
      if (inTrash || event.shiftKey) purge(selectedNode)
      else remove(selectedNode)
    } else if (event.key === 'F2' && !inTrash) {
      event.preventDefault()
      setRenaming(selectedNode.id)
    }
  }

  const places = [
    { path: '/', name: fs.name, icon: House },
    ...visibleChildren(fs)
      .filter((node) => node.kind === 'dir')
      .map((node) => ({
        path: childPath('/', node),
        name: node.name,
        icon: childPath('/', node) === DESKTOP_PATH ? Monitor : Folder,
      })),
    { path: TRASH_PATH, name: t('fs.trash'), icon: Trash },
  ]

  const ownSelected = selectedNode && canModify(selectedNode)

  return (
    <div className="app files">
      <div className="toolbar">
        <button className="icon-button" onClick={goBack} disabled={history.length === 0} aria-label={t('common.back')}>
          <ArrowLeft size={17} />
        </button>
        <button
          className="icon-button"
          onClick={() => go(chainPath(chain.slice(0, -1)), 'up')}
          disabled={chain.length === 1}
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
            {chain.map((node, index) => {
              const last = index === chain.length - 1
              return (
                <span key={index}>
                  {index > 0 && <ChevronRight size={14} />}
                  <button
                    aria-current={last ? 'page' : undefined}
                    className={dropTarget === chainPath(chain.slice(0, index + 1)) ? 'is-drop-target' : undefined}
                    onClick={() => (last ? setEditingPath(true) : go(chainPath(chain.slice(0, index + 1)), 'breadcrumb'))}
                    {...(last ? {} : dropInto(chainPath(chain.slice(0, index + 1))))}
                  >
                    {node.name}
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
                <ToolbarButton icon={RotateCcw} label={t('action.restore')} onClick={() => restore(selectedNode)} />
                <ToolbarButton icon={Trash2} label={t('action.purge')} onClick={() => purge(selectedNode)} />
              </>
            )}
            <button className="button" onClick={empty} disabled={!trashHasOwn}>
              {t('action.emptyTrash')}
            </button>
          </>
        ) : (
          <>
            {ownSelected && (
              <>
                <ToolbarButton icon={Pencil} label={t('action.rename')} onClick={() => setRenaming(selectedNode.id)} />
                <ToolbarButton icon={Trash2} label={t('action.delete')} onClick={() => remove(selectedNode)} />
              </>
            )}
            {writable && (
              <>
                <ToolbarButton icon={FilePlus} label={t('action.newFile')} onClick={() => create('file')} />
                <ToolbarButton icon={FolderPlus} label={t('action.newFolder')} onClick={() => create('dir')} />
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
            {items.map((node) => (
              <li key={node.id}>
                {renaming === node.id ? (
                  <div className="file is-selected">
                    <NodeIcon node={node} size={46} />
                    <RenameField
                      name={node.name}
                      keepExtension={node.kind === 'file'}
                      onDone={(name) => rename(node, name)}
                    />
                  </div>
                ) : (
                  <button
                    className={`file${selected === node.id ? ' is-selected' : ''}${
                      dropTarget !== null && dropTarget === folderOf(node) ? ' is-drop-target' : ''
                    }`}
                    // The visitor's own files and folders can be dragged into folders, here, in another window or on the desktop.
                    draggable={!mobile && isUserNode(node)}
                    onDragStart={(event) => {
                      setSelected(node.id)
                      event.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify([childPath(here, node)]))
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    {...(folderOf(node) ? dropInto(folderOf(node)!) : {})}
                    // A tap opens on the phone; on the desktop a click selects and a double click opens.
                    onClick={() => (mobile ? open(node) : setSelected(node.id))}
                    onDoubleClick={() => !mobile && open(node)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') open(node)
                    }}
                    onFocus={() => !mobile && setSelected(node.id)}
                    onContextMenu={(event) => {
                      setSelected(node.id)
                      openMenu(event, itemActions(node))
                    }}
                  >
                    <NodeIcon node={node} size={46} />
                    <span>{node.name}</span>
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
