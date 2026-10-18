import { type FileSource, track } from '../analytics.ts'
import type { Translate } from '../i18n/index.ts'
import { DESKTOP_PATH, type FsDir, type FsNode, TRASH_PATH, chainPath, getFs, joinPath, walk } from './fs.ts'
import { settings } from './settings.ts'
import { useStore } from './store.ts'
import { FsError, type UserNode, commit, isInside, newKey, userFs } from './userFs.ts'

// Everything that changes the visitor's files. Paths are absolute; each
// operation checks what it's given and throws an FsError when it refuses.
// Only the visitor's own nodes can change: the résumé tree is read-only.

/** Longest text a file can hold, to stay well inside the browser's storage. */
export const MAX_FILE_LENGTH = 200_000

const root = () => getFs(settings.get().locale)

function resolve(path: string): { node: FsNode; path: string } {
  const chain = walk(root(), path)
  if (!chain) throw new FsError('notFound', path)
  return { node: chain.at(-1)!, path: chainPath(chain) }
}

export const isUserNode = (node: FsNode) => node.key !== undefined

/** Whether `path` is something inside the Trash (not the Trash itself). */
export const isInTrash = (path: string) => path !== TRASH_PATH && isInside(path, TRASH_PATH)

/** Folders the visitor can create things in: every one but the Trash and what's in it. */
export function canCreateIn(path: string): boolean {
  const chain = walk(root(), path)
  return !!chain && chain.at(-1)!.kind === 'dir' && !isInside(chainPath(chain), TRASH_PATH)
}

/** A clean name, or an invalidName error. New files without an extension become `.txt`. */
function cleanName(name: string, kind: UserNode['kind'], addExtension: boolean): string {
  const clean = name.trim()
  if (!clean || clean.includes('/') || clean === '.' || clean === '..' || clean.length > 120) {
    throw new FsError('invalidName', name)
  }
  return addExtension && kind === 'file' && !/\.[^.\s]+$/.test(clean) ? `${clean}.txt` : clean
}

/** Whether a child of `folder` other than the node `except` (a key) already answers to `name`. */
function taken(folder: FsDir, name: string, except?: string): boolean {
  const wanted = name.toLowerCase()
  return folder.children.some(
    (child) =>
      (except === undefined || child.key !== except) &&
      (child.id.toLowerCase() === wanted || child.name.toLowerCase() === wanted),
  )
}

/** `name`, or `name (2)`, `name (3)`... before the extension, whichever is free in `folder`. */
function uniqueName(folder: FsDir, name: string, kind: UserNode['kind']): string {
  if (!taken(folder, name)) return name
  const dot = kind === 'file' ? name.lastIndexOf('.') : -1
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${extension}`
    if (!taken(folder, candidate)) return candidate
  }
}

function writableFolder(path: string): { folder: FsDir; path: string } {
  const found = resolve(path)
  if (found.node.kind !== 'dir') throw new FsError('notDir', found.node.name)
  if (isInside(found.path, TRASH_PATH)) throw new FsError('readOnly', found.node.name)
  return { folder: found.node, path: found.path }
}

/** The visitor's record behind `path`, or readOnly for a node of the résumé. */
function ownNode(path: string): UserNode {
  const { node } = resolve(path)
  const record = node.key ? userFs.get().nodes.find((other) => other.key === node.key) : undefined
  if (!record) throw new FsError('readOnly', node.name)
  return record
}

const pathOf = (node: UserNode) => joinPath(node.parent, node.name)

const current = (key: string) => userFs.get().nodes.find((node) => node.key === key)!

/** The records behind `paths`, leaving out those inside another of them: they move with their folder. */
function ownNodes(paths: string[]): UserNode[] {
  const records = paths.map(ownNode)
  return records.filter(
    (record) =>
      !records.some((other) => other !== record && other.kind === 'dir' && isInside(record.parent, pathOf(other))),
  )
}

/** All the nodes, with `record` (and whatever is inside it) moved to `parent` under `name`. */
function moved(record: UserNode, parent: string, name: string, patch: Partial<UserNode> = {}): UserNode[] {
  const from = pathOf(record)
  const to = joinPath(parent, name)
  return userFs.get().nodes.map((node) => {
    if (node.key === record.key) return { ...node, ...patch, parent, name, updatedAt: Date.now() }
    if (record.kind === 'dir' && isInside(node.parent, from)) return { ...node, parent: to + node.parent.slice(from.length) }
    return node
  })
}

const kindLabel = (kind: UserNode['kind']) => (kind === 'dir' ? 'folder' : 'file')

/**
 * Creates a file or folder in `parent`. A taken name gets a number, unless
 * `unique` is false, which makes it an error instead (what the Terminal wants).
 */
export function createNode(
  parent: string,
  kind: UserNode['kind'],
  name: string,
  source: FileSource,
  { unique = true, content = '' }: { unique?: boolean; content?: string } = {},
): { path: string; key: string } {
  const { folder, path } = writableFolder(parent)
  let clean = cleanName(name, kind, true)
  if (taken(folder, clean)) {
    if (!unique) throw new FsError('exists', clean)
    clean = uniqueName(folder, clean, kind)
  }
  if (content.length > MAX_FILE_LENGTH) throw new FsError('tooLarge', clean)
  const now = Date.now()
  const node: UserNode = { key: newKey(), kind, name: clean, parent: path, createdAt: now, updatedAt: now }
  if (kind === 'file') node.content = content
  commit([...userFs.get().nodes, node])
  track('file_created', { kind: kindLabel(kind), source })
  return { path: joinPath(path, clean), key: node.key }
}

/** Replaces the text of one of the visitor's files. */
export function writeFile(path: string, content: string) {
  const record = ownNode(path)
  if (record.kind !== 'file' || isInside(record.parent, TRASH_PATH)) throw new FsError('readOnly', record.name)
  if (content.length > MAX_FILE_LENGTH) throw new FsError('tooLarge', record.name)
  commit(
    userFs
      .get()
      .nodes.map((node) => (node.key === record.key ? { ...node, content, updatedAt: Date.now() } : node)),
  )
  track('file_saved', { characters: content.length })
}

/** Marks one of the visitor's nodes as just changed, like `touch` on an existing file. */
export function touchNode(path: string) {
  const record = ownNode(path)
  commit(userFs.get().nodes.map((node) => (node.key === record.key ? { ...node, updatedAt: Date.now() } : node)))
}

/** Renames in place and returns the new path. Extensions are left as typed. */
export function renameNode(path: string, name: string): string {
  const record = ownNode(path)
  if (isInside(record.parent, TRASH_PATH)) throw new FsError('readOnly', record.name)
  const clean = cleanName(name, record.kind, false)
  if (clean === record.name) return pathOf(record)
  const { folder } = writableFolder(record.parent)
  if (taken(folder, clean, record.key)) throw new FsError('exists', clean)
  commit(moved(record, record.parent, clean))
  track('file_renamed', { kind: kindLabel(record.kind) })
  return joinPath(record.parent, clean)
}

/** Moves nodes to the Trash, remembering where they were. */
export function trashNodes(paths: string[], source: FileSource) {
  const records = ownNodes(paths).filter((record) => !isInside(record.parent, TRASH_PATH))
  for (const { key } of records) {
    const record = current(key)
    const trash = resolve(TRASH_PATH).node as FsDir
    commit(moved(record, TRASH_PATH, uniqueName(trash, record.name, record.kind), { trashedFrom: record.parent }))
  }
  if (records.length > 0) track('file_deleted', { items: records.length, permanent: false, source })
}

/** Puts nodes back where they were deleted from, or on the desktop if that folder is gone. */
export function restoreNodes(paths: string[]) {
  const records = ownNodes(paths)
  for (const { key } of records) {
    const record = current(key)
    const target = record.trashedFrom && canCreateIn(record.trashedFrom) ? record.trashedFrom : DESKTOP_PATH
    const { folder, path } = writableFolder(target)
    commit(moved(record, path, uniqueName(folder, record.name, record.kind), { trashedFrom: undefined }))
  }
  if (records.length > 0) track('file_restored', { items: records.length })
}

/** Deletes nodes and everything inside them for good. */
export function purgeNodes(paths: string[], source: FileSource) {
  const records = ownNodes(paths)
  const gone = (node: UserNode) =>
    records.some((record) => node.key === record.key || (record.kind === 'dir' && isInside(node.parent, pathOf(record))))
  commit(userFs.get().nodes.filter((node) => !gone(node)))
  if (records.length > 0) track('file_deleted', { items: records.length, permanent: true, source })
}

/** Deletes for good everything in the Trash. */
export function emptyTrash() {
  const { nodes } = userFs.get()
  const items = nodes.filter((node) => node.parent === TRASH_PATH).length
  if (items === 0) return
  commit(nodes.filter((node) => !isInside(node.parent, TRASH_PATH)))
  track('trash_emptied', { items })
}

/** Whether there is anything in the Trash. */
export function useTrashFull(): boolean {
  return useStore(userFs, (state) => state.nodes.some((node) => node.parent === TRASH_PATH))
}

/** The message for an FsError; anything else is a bug and is thrown again. */
export function fsErrorMessage(t: Translate, error: unknown): string {
  if (error instanceof FsError) return t(`fs.error.${error.code}`, { name: error.target })
  throw error
}
