import {
  AppWindow,
  ChevronLeft,
  Clock,
  EllipsisVertical,
  ExternalLink,
  FilePlus,
  FolderPlus,
  House,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { track } from '../../analytics.ts'
import { ActionSheet } from '../../components/ActionSheet.tsx'
import type { MenuItem } from '../../components/ContextMenu.tsx'
import { FileGlyph } from '../../components/FileGlyph.tsx'
import { RenameField } from '../../components/NameField.tsx'
import {
  type AppProps,
  type Entry,
  LAUNCHER_MIME,
  type OS,
  TRASH_PATH,
  canModify,
  dirname,
  formatDate,
  fsErrorMessage,
  isInside,
  isOwn,
  joinPath,
  publicPath,
  relativeDay,
  useAppWindow,
  useLocale,
  useOS,
  useT,
} from '../../sdk/index.ts'
import { trackProjectResource } from './track.ts'

// Files on the phone, as a cloud drive: folders as tiles, files as rows, a
// sheet of actions for each, and the Trash and recent files as tabs. There's
// no dragging: everything is a tap.

type Tab = 'home' | 'recent' | 'trash'

/** Files in the quick access row. */
const QUICK_ACCESS = 8
/** How deep search and the recent files look into folders. */
const MAX_DEPTH = 8
/** Within this many days a date reads "today", "2 days ago"... */
const RELATIVE_DAYS = 7

/** Every entry under `folder` (not the Trash, which is hidden), folders before what they hold. */
function walk(os: OS, folder: string, depth = 0): Entry[] {
  if (depth > MAX_DEPTH) return []
  return os.fs
    .readdir(folder)
    .flatMap((entry) => (entry.inode.kind === 'dir' ? [entry, ...walk(os, entry.path, depth + 1)] : [entry]))
}

/** For search: lower case, without accents. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const isShortcut = (entry: Entry) => entry.inode.kind === 'symlink' || entry.mime === LAUNCHER_MIME

const depth = (entry: Entry) => entry.path.split('/').length

/**
 * The visitor's files first, most recently changed first. The résumé's files
 * all date from when the page loaded, so they follow, the ones nearer the top
 * (the résumé itself) first.
 */
const byRecency = (a: Entry, b: Entry) =>
  Number(isOwn(b)) - Number(isOwn(a)) ||
  (isOwn(a) ? b.inode.mtime - a.inode.mtime : depth(a) - depth(b) || a.inode.ctime - b.inode.ctime)

function formatSize(bytes: number, locale: string) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const number = new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: unit === 0 ? 0 : 1 })
  return `${number.format(value)} ${units[unit]}`
}

export default function Drive({ args }: AppProps) {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const appWindow = useAppWindow()
  os.fs.useWatch()
  // What "today" and "2 days ago" are counted from.
  const [today] = useState(() => new Date())
  const startsInTrash = isInside(args.files?.[0] ?? '/', TRASH_PATH)
  const [tab, setTab] = useState<Tab>(startsInTrash ? 'trash' : 'home')
  const [path, setPath] = useState(startsInTrash ? '/' : (args.files?.[0] ?? '/'))
  const [query, setQuery] = useState('')
  /** The entry whose actions are showing, or 'new' for what can be created. */
  const [sheet, setSheet] = useState<Entry | 'new' | null>(null)
  /** Path of the entry being renamed. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fall back to the top if the folder stops resolving (deleted, say).
  const found = os.fs.lookup(path)
  const here = found?.inode.kind === 'dir' && !isInside(found.path, TRASH_PATH) ? found.path : '/'
  const items = os.fs.readdir(here)
  const trashItems = os.fs.readdir(TRASH_PATH)
  const searching = query.trim() !== ''

  // Search and the recent files look at the whole drive; it's a few dozen entries.
  const everything = searching || tab === 'recent' || (tab === 'home' && here === '/') ? walk(os, '/') : []
  const recentFiles = everything.filter((entry) => entry.inode.kind === 'file' && !isShortcut(entry)).toSorted(byRecency)

  const parentName = (folder: string) => (folder === '/' ? t('drive.home') : os.fs.displayName(folder))
  const title =
    tab === 'trash' ? t('fs.trash') : tab === 'recent' ? t('drive.recent') : here === '/' ? t('drive.home') : parentName(here)

  useEffect(() => {
    appWindow.setTitle(title)
  }, [appWindow, title])

  /** Runs a file operation, showing why if it's refused. */
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError(null)
    } catch (caught) {
      setError(fsErrorMessage(t, caught))
    }
  }

  const go = (to: string, method: 'item' | 'up' | 'sidebar') => {
    track('folder_opened', { path: publicPath(to), method })
    setPath(to)
    setTab('home')
    setQuery('')
    setRenaming(null)
  }

  const switchTab = (to: Tab) => {
    // "My Drive" again goes back to the top, like tapping a tab you're on in a phone app.
    if (to === 'home' && tab === 'home' && here !== '/') go('/', 'sidebar')
    setTab(to)
    setQuery('')
    setRenaming(null)
  }

  /** The folder an entry opens: the folder itself, or the one a shortcut points to. */
  const folderOf = (entry: Entry): string | null => {
    const target = entry.inode.kind === 'symlink' ? os.fs.lookup(entry.path) : entry
    return target?.inode.kind === 'dir' ? target.path : null
  }

  const open = (entry: Entry, using?: string) => {
    trackProjectResource(entry, os.fs.chain(dirname(entry.path)))
    const folder = using ? null : folderOf(entry)
    if (folder) go(folder, 'item')
    else void attempt(() => os.openFile(entry.path, 'files', { with: using }))
  }

  const create = (kind: 'file' | 'dir') =>
    attempt(async () => {
      const name = t(kind === 'dir' ? 'fs.newFolder' : 'fs.newFile')
      setRenaming(await os.fs.create(joinPath(here, name), { kind, unique: true }))
    })

  const rename = (entry: Entry, name: string | null) => {
    setRenaming(null)
    if (name === null || name === entry.name) return
    void attempt(() => os.fs.rename(entry.path, joinPath(dirname(entry.path), name)))
  }

  const purge = async (entry: Entry) => {
    const confirmed = await os.dialog.confirm({
      title: t('action.purge'),
      message: t('action.confirmPurge', { name: entry.displayName }),
      confirm: t('action.purge'),
      cancel: t('common.cancel'),
      danger: true,
    })
    if (confirmed) await attempt(() => os.fs.remove([entry.path]))
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
      .map((app) => ({ label: t('action.openWith', { app: app.name }), icon: AppWindow, onSelect: () => open(entry, app.id) }))
  }

  const actionsFor = (entry: Entry): MenuItem[] => {
    const own = canModify(entry)
    if (isInside(entry.path, TRASH_PATH)) {
      return own
        ? [
            { label: t('action.restore'), icon: RotateCcw, onSelect: () => void attempt(() => os.fs.restore([entry.path])) },
            { label: t('action.purge'), icon: Trash2, onSelect: () => void purge(entry), danger: true },
          ]
        : []
    }
    return [
      { label: t('action.open'), icon: ExternalLink, onSelect: () => open(entry) },
      ...openWith(entry),
      ...(own
        ? [
            { label: t('action.rename'), icon: Pencil, onSelect: () => setRenaming(entry.path) },
            {
              label: t('action.delete'),
              icon: Trash2,
              onSelect: () => void attempt(() => os.fs.trash([entry.path])),
              danger: true,
            },
          ]
        : []),
    ]
  }

  const when = (time: number) => {
    const date = new Date(time)
    return Math.abs(today.getTime() - time) < RELATIVE_DAYS * 86_400_000
      ? relativeDay(date, today, locale)
      : formatDate(date, locale, 'short')
  }

  /** The line under a name: how much a folder holds; when a file of the visitor's changed, or its type, and its size. */
  const meta = (entry: Entry): string => {
    if (entry.inode.kind === 'dir') {
      const count = os.fs.readdir(entry.path).length
      return count === 1 ? t('drive.item') : t('drive.items', { count })
    }
    if (isShortcut(entry)) return t('drive.shortcut')
    const extension = entry.name.includes('.') ? entry.name.split('.').at(-1)!.toUpperCase() : ''
    const parts = [isOwn(entry) ? t('drive.edited', { when: when(entry.inode.mtime) }) : extension]
    if (entry.inode.size !== undefined) parts.push(formatSize(entry.inode.size, locale))
    return parts.filter(Boolean).join(' · ')
  }

  const showActions = (event: MouseEvent, entry: Entry) => {
    // A long press on a phone is a context menu.
    event.preventDefault()
    setSheet(entry)
  }

  /** A name, or the field renaming it. */
  const name = (entry: Entry) =>
    renaming === entry.path ? (
      <RenameField name={entry.name} keepExtension={entry.inode.kind === 'file'} onDone={(to) => rename(entry, to)} />
    ) : (
      <span className="drive-name">{entry.displayName}</span>
    )

  // Only when there's more to do than open it (a tap does that): the résumé's folders get none.
  const moreButton = (entry: Entry) =>
    actionsFor(entry).length > 1 && (
      <button className="drive-more" onClick={() => setSheet(entry)} aria-label={t('drive.more')}>
        <EllipsisVertical size={18} />
      </button>
    )

  /** A file as a row; `sub` replaces the line under its name. In the Trash, a tap shows what can be done with it. */
  const row = (entry: Entry, sub?: string) => {
    const body = (
      <>
        <span className="drive-glyph">
          <FileGlyph entry={entry} size={30} />
        </span>
        <span className="drive-text">
          {name(entry)}
          <span className="drive-meta">{sub ?? meta(entry)}</span>
        </span>
      </>
    )
    return (
      <li key={entry.path} className="drive-row">
        {renaming === entry.path ? (
          <div className="drive-row-main">{body}</div>
        ) : (
          <button
            className="drive-row-main"
            onClick={() => (isInside(entry.path, TRASH_PATH) ? setSheet(entry) : open(entry))}
            onContextMenu={(event) => showActions(event, entry)}
          >
            {body}
          </button>
        )}
        {moreButton(entry)}
      </li>
    )
  }

  const folderTile = (entry: Entry) => {
    const body = (
      <>
        <FileGlyph entry={entry} size={24} />
        {name(entry)}
      </>
    )
    return (
      <li key={entry.path} className="drive-folder">
        {renaming === entry.path ? (
          <div className="drive-folder-main">{body}</div>
        ) : (
          <button
            className="drive-folder-main"
            onClick={() => open(entry)}
            onContextMenu={(event) => showActions(event, entry)}
          >
            {body}
          </button>
        )}
        {moreButton(entry)}
      </li>
    )
  }

  const section = (heading: string, content: ReactNode) => (
    <section className="drive-section">
      <h2>{heading}</h2>
      {content}
    </section>
  )

  const folderView = () => {
    const folders = items.filter((entry) => entry.inode.kind === 'dir')
    const files = items.filter((entry) => entry.inode.kind !== 'dir')
    const quick = here === '/' ? recentFiles.slice(0, QUICK_ACCESS) : []
    return (
      <>
        {here !== '/' && (
          <button className="drive-up" onClick={() => go(dirname(here), 'up')}>
            <ChevronLeft size={20} />
            {parentName(dirname(here))}
          </button>
        )}
        {quick.length > 0 &&
          section(
            t('drive.quickAccess'),
            <ul className="drive-quick">
              {quick.map((entry) => (
                <li key={entry.path}>
                  <button
                    className="drive-card"
                    onClick={() => open(entry)}
                    onContextMenu={(event) => showActions(event, entry)}
                  >
                    <span className="drive-card-preview">
                      <FileGlyph entry={entry} size={44} />
                    </span>
                    <span className="drive-name">{entry.displayName}</span>
                    <span className="drive-meta">{meta(entry)}</span>
                  </button>
                </li>
              ))}
            </ul>,
          )}
        {folders.length > 0 && section(t('drive.folders'), <ul className="drive-folders">{folders.map(folderTile)}</ul>)}
        {files.length > 0 &&
          section(t('drive.files'), <ul className="drive-list">{files.map((entry) => row(entry))}</ul>)}
        {items.length === 0 && <p className="app-empty">{t('files.empty')}</p>}
      </>
    )
  }

  const trashView = () => (
    <>
      <div className="drive-trash-bar">
        <p>{t('drive.trashHint')}</p>
        <button className="button" onClick={() => void empty()} disabled={trashItems.length === 0}>
          {t('action.emptyTrash')}
        </button>
      </div>
      {trashItems.length > 0 ? (
        <ul className="drive-list">{trashItems.map((entry) => row(entry))}</ul>
      ) : (
        <p className="app-empty">{t('drive.trashEmpty')}</p>
      )}
    </>
  )

  const searchView = () => {
    const words = fold(query.trim())
    const results = everything.filter((entry) => fold(entry.displayName).includes(words))
    return results.length > 0 ? (
      <ul className="drive-list">
        {results.map((entry) => row(entry, t('drive.in', { folder: parentName(dirname(entry.path)) })))}
      </ul>
    ) : (
      <p className="app-empty">{t('drive.noResults', { query: query.trim() })}</p>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof House }[] = [
    { id: 'home', label: t('drive.home'), icon: House },
    { id: 'recent', label: t('drive.recent'), icon: Clock },
    { id: 'trash', label: t('fs.trash'), icon: Trash2 },
  ]

  return (
    <div className="app drive">
      <div className="drive-top">
        <label className="drive-search">
          <Search size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('drive.search')}
            aria-label={t('drive.search')}
          />
          {searching && (
            <button onClick={() => setQuery('')} aria-label={t('common.cancel')}>
              <X size={16} />
            </button>
          )}
        </label>
      </div>

      {error && (
        <p className="app-error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      <div className="drive-scroll">
        {searching
          ? searchView()
          : tab === 'trash'
            ? trashView()
            : tab === 'recent'
              ? recentFiles.length > 0 && <ul className="drive-list">{recentFiles.map((entry) => row(entry))}</ul>
              : folderView()}
      </div>

      {tab === 'home' && !searching && os.fs.canCreateIn(here) && (
        <button className="drive-fab" onClick={() => setSheet('new')} aria-label={t('drive.new')}>
          <Plus size={26} />
        </button>
      )}

      <nav className="drive-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id && !searching ? 'is-active' : undefined}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => switchTab(id)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {sheet === 'new' && (
        <ActionSheet
          header={<strong>{t('drive.new')}</strong>}
          items={[
            { label: t('action.newFolder'), icon: FolderPlus, onSelect: () => void create('dir') },
            { label: t('action.newFile'), icon: FilePlus, onSelect: () => void create('file') },
          ]}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && sheet !== 'new' && (
        <ActionSheet
          header={
            <>
              <FileGlyph entry={sheet} size={36} />
              <span className="drive-text">
                <strong className="drive-name">{sheet.displayName}</strong>
                <span className="drive-meta">{meta(sheet)}</span>
              </span>
            </>
          }
          items={actionsFor(sheet)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
