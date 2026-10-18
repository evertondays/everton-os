import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
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
import { type KeyboardEvent, type MouseEvent, useEffect, useState } from 'react'
import { type AnalyticsEvents, track } from '../analytics.ts'
import { ContextMenu, type MenuItem, type MenuState } from '../components/ContextMenu.tsx'
import { RenameField } from '../components/NameField.tsx'
import { useT } from '../i18n/index.ts'
import type { AppProps } from '../system/apps.ts'
import {
  canCreateIn,
  createNode,
  emptyTrash,
  fsErrorMessage,
  isUserNode,
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
  splitPath,
  useFs,
  visibleChildren,
  walk,
} from '../system/fs.ts'
import { openNode, useAppWindow, useOS } from '../system/os.ts'
import { isInside } from '../system/userFs.ts'

type FolderMethod = AnalyticsEvents['folder_opened']['method']

function NodeIcon({ node, size }: { node: FsNode; size: number }) {
  if (node.kind === 'dir') return <Folder className="file-icon is-folder" size={size} strokeWidth={1.5} />
  if (node.type === 'image') return <img className="file-thumbnail" src={node.src} alt="" style={{ height: size }} />
  if (node.type === 'resume') return <FileUser className="file-icon is-resume" size={size} strokeWidth={1.5} />
  if (node.type === 'link') return <Globe className="file-icon is-link" size={size} strokeWidth={1.5} />
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

  const go = (to: string, method: FolderMethod) => {
    track('folder_opened', { path: publicPath(to), method })
    setHistory((list) => [...list, here])
    setPath(to)
    setSelected(null)
    setRenaming(null)
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
    if (target.startsWith(`${PROJECTS_PATH}/`)) {
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

  const purge = (node: FsNode) => {
    if (!window.confirm(t('action.confirmPurge', { count: 1 }))) return
    attempt(() => {
      purgeNodes([childPath(here, node)], 'files')
      setSelected(null)
    })
  }

  const empty = () => {
    if (window.confirm(t('action.confirmEmpty'))) attempt(emptyTrash)
  }

  const itemActions = (node: FsNode): MenuItem[] => {
    const own = isUserNode(node)
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
    if (!selectedNode || !isUserNode(selectedNode) || renaming) return
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

  const ownSelected = selectedNode && isUserNode(selectedNode)

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
        <nav className="breadcrumb" aria-label={t('files.path')}>
          {chain.map((node, index) => (
            <span key={index}>
              {index > 0 && <ChevronRight size={14} />}
              <button
                onClick={() => go(chainPath(chain.slice(0, index + 1)), 'breadcrumb')}
                disabled={index === chain.length - 1}
              >
                {node.name}
              </button>
            </span>
          ))}
        </nav>
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
                className={place.path === here ? 'is-active' : ''}
                onClick={() => place.path !== here && go(place.path, 'sidebar')}
              >
                <place.icon size={16} />
                {place.name}
              </button>
            ))}
          </aside>
        )}

        {items.length === 0 ? (
          <p className="app-empty" onContextMenu={(event) => openMenu(event, folderActions())}>
            {t('files.empty')}
          </p>
        ) : (
          <ul
            className="files-grid"
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
                    className={`file${selected === node.id ? ' is-selected' : ''}`}
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
