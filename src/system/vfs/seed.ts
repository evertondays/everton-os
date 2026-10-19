import { joinPath } from './path.ts'
import type { Change, StoredInode, UpperFs } from './types.ts'
import { DESKTOP_PATH, TRASH_INFO_PATH, TRASH_PATH, lowerRef, trashInfo } from './vfs.ts'

// What the visitor's layer starts with, and how files saved by the first
// version of the site (one JSON in localStorage) move into it.

/** Where the first version kept the visitor's files. Left in place for now, so a rollback finds them. */
export const LEGACY_KEY = 'everton-os:files'
export const LEGACY_VERSION = 'localStorage:v1'

/**
 * The desktop's shortcuts: symlinks to a file or folder, and launchers
 * (`<app>.app`, whose content is the app's id). They can be moved but not
 * renamed or deleted. Their inos are the keys the first version gave them, so
 * their icons keep their places.
 */
const SHORTCUTS = [
  { id: 'resume', name: 'resume.pdf', target: '/resume.pdf' },
  { id: 'projects', name: 'projects', target: '/projects' },
  { id: 'contact', name: 'contact.app', app: 'contact' },
  { id: 'terminal', name: 'terminal.app', app: 'terminal' },
] as const

type ShortcutId = (typeof SHORTCUTS)[number]['id']

/**
 * A shortcut's changes. Its ctime is `now` plus its place in the list (in
 * milliseconds), which keeps them listed in that order.
 */
function shortcut(id: ShortcutId, parent: string, now: number, name?: string): Change[] {
  const index = SHORTCUTS.findIndex((other) => other.id === id)
  const spec = SHORTCUTS[index]
  const ino = `shortcut-${id}`
  const base = { ino, ctime: now + index, mtime: now + index, flags: ['immutable' as const] }
  const changes: Change[] = []
  if ('target' in spec) {
    changes.push({ type: 'inode', inode: { ...base, kind: 'symlink', target: spec.target } })
  } else {
    changes.push(
      { type: 'inode', inode: { ...base, kind: 'file', size: spec.app.length } },
      { type: 'data', ino, content: spec.app },
    )
  }
  changes.push({ type: 'link', parent, name: name ?? spec.name, ino })
  return changes
}

export function defaultSeed(now = Date.now()): Change[] {
  return SHORTCUTS.flatMap(({ id }) => shortcut(id, lowerRef(DESKTOP_PATH), now))
}

interface V1Node {
  key: string
  kind: 'file' | 'dir'
  name: string
  /** Canonical path of its folder. The Trash was `/trash`. */
  parent: string
  content?: string
  shortcut?: ShortcutId
  createdAt: number
  updatedAt: number
  /** Set while it was in the Trash: the folder it was deleted from. */
  trashedFrom?: string
}

const OLD_TRASH = '/trash'

/** A path of the first version as it is now: the Trash moved to `/.trash/files`. */
const currentPath = (path: string) =>
  path === OLD_TRASH || path.startsWith(`${OLD_TRASH}/`) ? TRASH_PATH + path.slice(OLD_TRASH.length) : path

/** The changes that bring the first version's files over, or null if there's nothing readable. */
export function migrateV1(json: string, now = Date.now()): Change[] | null {
  let saved: { nodes?: unknown; seeded?: boolean }
  try {
    saved = JSON.parse(json) as typeof saved
  } catch {
    return null
  }
  if (!saved || !Array.isArray(saved.nodes)) return null
  const nodes = (saved.nodes as V1Node[]).filter(
    (node) => node && typeof node.key === 'string' && typeof node.name === 'string' && typeof node.parent === 'string',
  )

  // The visitor's folders, by the path they had: what's inside them now hangs from their ino.
  const folders = new Map(nodes.filter((node) => node.kind === 'dir').map((node) => [joinPath(node.parent, node.name), node.key]))
  const parentRef = (parent: string) => folders.get(parent) ?? lowerRef(currentPath(parent))

  const used = new Map<string, Set<string>>()
  /** `name`, numbered if something in `parent` already has it. */
  const claim = (parent: string, name: string) => {
    const names = used.get(parent) ?? new Set<string>()
    used.set(parent, names)
    let unique = name
    for (let n = 2; names.has(unique.toLowerCase()); n++) unique = `${name} (${n})`
    names.add(unique.toLowerCase())
    return unique
  }

  const changes: Change[] = []
  const shortcuts = new Set<ShortcutId>()
  for (const node of nodes) {
    const parent = parentRef(node.parent)
    if (node.shortcut && SHORTCUTS.some((spec) => spec.id === node.shortcut)) {
      shortcuts.add(node.shortcut)
      // Launchers are named after their app, with `.app`.
      const name = node.shortcut === 'contact' || node.shortcut === 'terminal' ? `${node.name}.app` : node.name
      changes.push(...shortcut(node.shortcut, parent, now, claim(parent, name)))
      continue
    }
    const inode: StoredInode = {
      ino: node.key,
      kind: node.kind,
      ctime: node.createdAt ?? 0,
      mtime: node.updatedAt ?? node.createdAt ?? 0,
    }
    const name = claim(parent, node.name)
    if (node.kind === 'file') {
      const content = node.content ?? ''
      inode.size = new Blob([content]).size
      changes.push({ type: 'data', ino: node.key, content })
    }
    changes.push({ type: 'inode', inode }, { type: 'link', parent, name, ino: node.key })
    // In the Trash, where it came from goes in a .trashinfo.
    if (node.trashedFrom && parent === lowerRef(TRASH_PATH)) {
      const ino = `${node.key}-trashinfo`
      const text = trashInfo(joinPath(currentPath(node.trashedFrom), node.name), inode.mtime)
      const infoParent = lowerRef(TRASH_INFO_PATH)
      changes.push(
        { type: 'inode', inode: { ino, kind: 'file', ctime: inode.mtime, mtime: inode.mtime, size: text.length } },
        { type: 'data', ino, content: text },
        { type: 'link', parent: infoParent, name: claim(infoParent, `${name}.trashinfo`), ino },
      )
    }
  }
  // The first version added the shortcuts on its first save; before that, they weren't stored.
  if (!saved.seeded) {
    for (const { id, name } of SHORTCUTS) {
      if (!shortcuts.has(id)) changes.push(...shortcut(id, lowerRef(DESKTOP_PATH), now, claim(lowerRef(DESKTOP_PATH), name)))
    }
  }
  return changes
}

/**
 * Fills a new visitor's layer: the first version's files if there are any,
 * else the default shortcuts. Only once: later calls do nothing. Resolves
 * with what it did.
 */
export async function seed(upper: UpperFs, legacy: string | null): Promise<'migrated' | 'seeded' | null> {
  if (await upper.getMeta('seeded')) return null
  const migrated = legacy ? migrateV1(legacy) : null
  await upper.apply([
    ...(migrated ?? defaultSeed()),
    { type: 'meta', key: 'seeded', value: true },
    ...(migrated ? [{ type: 'meta' as const, key: 'migratedFrom', value: LEGACY_VERSION }] : []),
  ])
  return migrated ? 'migrated' : 'seeded'
}
