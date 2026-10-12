import { ArrowLeft, ArrowUp, ChevronRight, FileText, FileUser, Folder, Globe, House, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type AnalyticsEvents, track } from '../analytics.ts'
import { useT } from '../i18n/index.ts'
import type { AppProps } from '../system/apps.ts'
import { type FsNode, PROJECTS_PATH, TRASH_PATH, chainPath, childPath, useFs, visibleChildren, walk } from '../system/fs.ts'
import { openNode, useAppWindow, useOS } from '../system/os.ts'

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

  // Fall back to the home folder if the path stops resolving.
  const found = walk(fs, path)
  const chain = found && found.at(-1)!.kind === 'dir' ? found : [fs]
  const current = chain.at(-1)!
  const here = chainPath(chain)
  const items = current.kind === 'dir' ? visibleChildren(current) : []
  const mobile = os.shell === 'mobile'

  useEffect(() => {
    appWindow.setTitle(current.name)
  }, [appWindow, current.name])

  const go = (to: string, method: FolderMethod) => {
    track('folder_opened', { path: to, method })
    setHistory((list) => [...list, here])
    setPath(to)
    setSelected(null)
  }

  const goBack = () => {
    const previous = history.at(-1)
    if (previous === undefined) return
    track('folder_opened', { path: previous, method: 'back' })
    setHistory((list) => list.slice(0, -1))
    setPath(previous)
    setSelected(null)
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

  const places = [
    { path: '/', name: fs.name, icon: House },
    ...visibleChildren(fs)
      .filter((node) => node.kind === 'dir')
      .map((node) => ({ path: childPath('/', node), name: node.name, icon: Folder })),
    { path: TRASH_PATH, name: t('fs.trash'), icon: Trash },
  ]

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
      </div>

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
          <p className="app-empty">{t('files.empty')}</p>
        ) : (
          <ul
            className="files-grid"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelected(null)
            }}
          >
            {items.map((node) => (
              <li key={node.id}>
                <button
                  className={`file${selected === node.id ? ' is-selected' : ''}`}
                  // A tap opens on the phone; on the desktop a click selects and a double click opens.
                  onClick={() => (mobile ? open(node) : setSelected(node.id))}
                  onDoubleClick={() => !mobile && open(node)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') open(node)
                  }}
                >
                  <NodeIcon node={node} size={46} />
                  <span>{node.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
