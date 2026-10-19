import { LOWER, type OverlayFs } from './drivers/overlayfs.ts'
import { VfsError } from './errors.ts'
import { LAUNCHER_MIME, mimeOf } from './mime.ts'
import { ROOT, basename, isInside, joinPath, segments, splitPath } from './path.ts'
import type { Change, Content, Ino, Inode, InodeKind, StoredInode } from './types.ts'

// The virtual file system: resolves paths (`.`, `..`, `~`, symlinks) to
// inodes and does every file operation. Reading metadata is synchronous (it
// comes from the drivers' caches); reading data and changing anything is
// asynchronous. Changes run one at a time, each validated in full and then
// applied as one transaction, so a refused operation changes nothing.

export const DESKTOP_PATH = '/desktop'
export const TRASH_DIR = '/.trash'
/** Where deleted things go (freedesktop's Trash). */
export const TRASH_PATH = '/.trash/files'
/** One `<name>.trashinfo` per deleted thing: where it was and when it went. */
export const TRASH_INFO_PATH = '/.trash/info'

/** Longest text a file can hold. */
export const MAX_FILE_LENGTH = 200_000
/** Largest binary a file can hold (10 MB). */
export const MAX_BLOB_SIZE = 10 * 1024 * 1024
const MAX_NAME_LENGTH = 120
const MAX_SYMLINK_HOPS = 40

/** A path resolved to what it names. */
export interface Entry {
  /** The real name, what paths are made of. */
  name: string
  /** Canonical path: real names, with the symlinks before the last segment resolved. */
  path: string
  /** What the interface shows. */
  displayName: string
  mime: string
  inode: Inode
}

export interface ResolveOptions {
  /** Folder that relative paths start from. */
  cwd?: string
  /** Follow a symlink in the last segment (stat) or not (lstat). */
  follow?: boolean
  /**
   * When a real name isn't there, also try display names, ignoring case and
   * accents: `cd Projetos` in the Terminal.
   */
  lenient?: boolean
}

export interface VfsOptions {
  /** The name a launcher (`<id>.app`) shows: its app's, in the current language. */
  launcherName?(appId: string): string | undefined
}

interface Step {
  name: string
  path: string
  ino: Ino
  inode: Inode
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export const newIno = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** The app a launcher opens, from its name: `terminal.app` → `terminal`. */
export const launcherApp = (name: string) => name.replace(/\.app$/i, '')

const pad = (value: number) => String(value).padStart(2, '0')

/** A date as freedesktop's .trashinfo writes it: local time, no zone. */
function trashDate(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`
}

export function trashInfo(path: string, time: number): string {
  return `[Trash Info]\nPath=${encodeURI(path)}\nDeletionDate=${trashDate(time)}\n`
}

/** The original path written in a .trashinfo, or null. */
export function parseTrashInfo(text: string): string | null {
  const line = /^Path=(.*)$/m.exec(text)?.[1]?.trim()
  if (!line) return null
  try {
    return decodeURI(line)
  } catch {
    return line
  }
}

const toStored = ({ ino, kind, ctime, mtime, target, flags, size }: Inode): StoredInode => ({
  ino,
  kind,
  ctime,
  mtime,
  ...(target !== undefined && { target }),
  ...(flags && { flags: [...flags] }),
  ...(size !== undefined && { size }),
})

const sizeOf = (content: string | Blob) => (typeof content === 'string' ? new Blob([content]).size : content.size)

export class Vfs {
  private fs: OverlayFs | null = null
  private listeners = new Set<() => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private readonly options: VfsOptions
  private markReady!: () => void
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.markReady = resolve
  })
  /** Bumped on every change, for React (useSyncExternalStore). */
  version = 0

  constructor(options: VfsOptions = {}) {
    this.options = options
  }

  /** Mounts the root file system. Until then nothing can be read. */
  mount(fs: OverlayFs) {
    this.fs = fs
    fs.subscribe(() => this.changed())
    this.changed()
    this.markReady()
  }

  get mounted() {
    return this.fs !== null
  }

  ready(): Promise<void> {
    return this.readyPromise
  }

  /** The mounted drivers, for `mount` in the Terminal. */
  get drivers() {
    return { root: this.driver().name, lower: this.driver().lower.name, upper: this.driver().upper.name }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private changed() {
    this.version++
    this.listeners.forEach((listener) => listener())
  }

  private driver(): OverlayFs {
    if (!this.fs) throw new Error('The file system is not mounted yet')
    return this.fs
  }

  // Resolving

  private rootStep(): Step {
    const ino = this.driver().root()
    return { name: '', path: ROOT, ino, inode: this.driver().stat(ino)! }
  }

  private walk(path: string, { cwd = ROOT, follow = true, lenient = false }: ResolveOptions = {}): Step[] {
    const fs = this.driver()
    // `~` is the home folder, which is the root.
    const home = path === '~' || path.startsWith('~/') ? path.slice(1) || ROOT : path
    const queue = segments(home.startsWith('/') ? home : `${cwd}/${home}`)
    let chain = [this.rootStep()]
    let hops = 0
    while (queue.length > 0) {
      const segment = queue.shift()!
      if (segment === '.') continue
      if (segment === '..') {
        if (chain.length > 1) chain.pop()
        continue
      }
      const current = chain.at(-1)!
      if (current.inode.kind !== 'dir') throw new VfsError('ENOTDIR', path)
      const children = fs.readdir(current.ino)
      let name = segment
      let ino = children.get(segment)
      if (ino === undefined && lenient) {
        const wanted = plain(segment)
        for (const [childName, childIno] of children) {
          const child = fs.stat(childIno)
          if (child && (plain(childName) === wanted || plain(this.displayNameOf(childName, child, '')) === wanted)) {
            name = childName
            ino = childIno
            break
          }
        }
      }
      const inode = ino === undefined ? undefined : fs.stat(ino)
      if (ino === undefined || !inode) throw new VfsError('ENOENT', path)
      if (inode.kind === 'symlink' && (queue.length > 0 || follow)) {
        if (++hops > MAX_SYMLINK_HOPS) throw new VfsError('ELOOP', path)
        const target = inode.target ?? ''
        if (target.startsWith('/')) chain = [this.rootStep()]
        queue.unshift(...segments(target))
        continue
      }
      chain.push({ name, path: joinPath(current.path, name), ino, inode })
    }
    return chain
  }

  private entry(step: Step): Entry {
    return {
      name: step.name,
      path: step.path,
      inode: step.inode,
      mime: step.inode.mime ?? mimeOf(step.name, step.inode.kind),
      displayName: this.displayNameOf(step.name, step.inode, step.path),
    }
  }

  private displayNameOf(name: string, inode: Inode, path: string): string {
    if (inode.displayName) return inode.displayName
    if (inode.kind === 'file' && (inode.mime ?? mimeOf(name, 'file')) === LAUNCHER_MIME) {
      return this.options.launcherName?.(launcherApp(name)) ?? name
    }
    // A link named like what it points to shows that thing's name (the desktop's `projects` shows "Projetos").
    if (inode.kind === 'symlink' && path) {
      try {
        const target = this.walk(path).at(-1)!
        if (target.name === name) return this.displayNameOf(target.name, target.inode, target.path)
      } catch {
        // A broken link shows its own name.
      }
    }
    return name
  }

  /** What `path` names, or null if nothing (or a broken link, when following). */
  lookup(path: string, options?: ResolveOptions): Entry | null {
    try {
      return this.stat(path, options)
    } catch (error) {
      if (error instanceof VfsError) return null
      throw error
    }
  }

  stat(path: string, options?: ResolveOptions): Entry {
    return this.entry(this.walk(path, options).at(-1)!)
  }

  lstat(path: string, options?: Omit<ResolveOptions, 'follow'>): Entry {
    return this.stat(path, { ...options, follow: false })
  }

  /** The entries from the root down to `path` (the root first). */
  chain(path: string, options?: ResolveOptions): Entry[] {
    return this.walk(path, options).map((step) => this.entry(step))
  }

  /** Canonical path with every symlink resolved. */
  realpath(path: string, options?: Omit<ResolveOptions, 'follow'>): string {
    return this.walk(path, { ...options, follow: true }).at(-1)!.path
  }

  readlink(path: string, options?: Omit<ResolveOptions, 'follow'>): string {
    const { inode } = this.lstat(path, options)
    if (inode.kind !== 'symlink') throw new VfsError('EINVAL', path)
    return inode.target ?? ''
  }

  displayName(path: string): string {
    return this.lookup(path, { follow: false })?.displayName ?? basename(path)
  }

  /**
   * A folder's entries: the résumé's first, in their order, then the
   * visitor's (immutable ones first, then folders, then files, by name).
   * Names starting with a dot are left out unless `all`.
   */
  readdir(path: string, { all = false, ...options }: ResolveOptions & { all?: boolean } = {}): Entry[] {
    const dir = this.walk(path, { ...options, follow: true }).at(-1)!
    if (dir.inode.kind !== 'dir') throw new VfsError('ENOTDIR', path)
    const entries: Entry[] = []
    for (const [name, ino] of this.driver().readdir(dir.ino)) {
      if (!all && name.startsWith('.')) continue
      const inode = this.driver().stat(ino)
      if (inode) entries.push(this.entry({ name, ino, inode, path: joinPath(dir.path, name) }))
    }
    const rank = (entry: Entry) =>
      entry.inode.flags?.includes('immutable') ? 0 : entry.inode.kind === 'dir' ? 1 : 2
    const lower = entries.filter((entry) => entry.inode.layer !== 'upper')
    const upper = entries
      .filter((entry) => entry.inode.layer === 'upper')
      .toSorted(
        (a, b) =>
          rank(a) - rank(b) || (rank(a) === 0 ? a.inode.ctime - b.inode.ctime : 0) || a.name.localeCompare(b.name),
      )
    return [...lower, ...upper]
  }

  async readFile(path: string, options?: Omit<ResolveOptions, 'follow'>): Promise<Content> {
    const step = this.walk(path, { ...options, follow: true }).at(-1)!
    if (step.inode.kind === 'dir') throw new VfsError('EISDIR', path)
    return this.driver().read(step.ino)
  }

  /** Whether new things can go in `path`: a folder outside the Trash. */
  canCreateIn(path: string): boolean {
    const dir = this.lookup(path)
    return !!dir && dir.inode.kind === 'dir' && !isInside(dir.path, TRASH_DIR)
  }

  // Changing

  /** Runs `task` after the changes before it, so they never interleave. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async apply(changes: Change[]) {
    if (changes.length > 0) await this.driver().apply(changes)
  }

  private writableDir(path: string, options?: ResolveOptions): Step {
    const dir = this.walk(path, { ...options, follow: true }).at(-1)!
    if (dir.inode.kind !== 'dir') throw new VfsError('ENOTDIR', path)
    if (isInside(dir.path, TRASH_DIR)) throw new VfsError('EROFS', this.displayNameOf(dir.name, dir.inode, dir.path))
    return dir
  }

  /** One of the visitor's own things (not followed if it's a link); the résumé's are read-only. */
  private own(path: string, options?: ResolveOptions): Step {
    const step = this.walk(path, { ...options, follow: false }).at(-1)!
    if (step.inode.layer !== 'upper') throw new VfsError('EROFS', this.displayNameOf(step.name, step.inode, step.path))
    return step
  }

  /** The visitor's things behind `paths`, leaving out those inside another of them: they go with their folder. */
  private ownAll(paths: string[], options?: ResolveOptions): Step[] {
    const steps = paths.map((path) => this.own(path, options))
    return steps.filter(
      (step, index) =>
        steps.findIndex((other) => other.ino === step.ino) === index &&
        !steps.some(
          (other) => other.path !== step.path && other.inode.kind === 'dir' && isInside(step.path, other.path),
        ),
    )
  }

  private isImmutable = (step: Step) => step.inode.flags?.includes('immutable') ?? false

  private parentOf(step: Step): string {
    const dentry = this.driver().dentry(step.ino)
    if (!dentry) throw new VfsError('ENOENT', step.path)
    return dentry.parent
  }

  /** A clean name, or EINVAL. New files without an extension get `extension`. */
  private cleanName(name: string, extension?: string): string {
    const clean = name.trim()
    if (!clean || clean.includes('/') || clean === '.' || clean === '..' || clean.length > MAX_NAME_LENGTH) {
      throw new VfsError('EINVAL', name)
    }
    return extension && !/\.[^.\s]+$/.test(clean) ? `${clean}${extension}` : clean
  }

  /** Whether something in `dir` (other than `except`) already answers to `name`, by real or shown name, in any case. */
  private taken(dir: Step, name: string, except?: Ino, claimed?: Set<string>): boolean {
    const wanted = name.toLowerCase()
    if (claimed?.has(wanted)) return true
    for (const [childName, ino] of this.driver().readdir(dir.ino)) {
      if (ino === except) continue
      const inode = this.driver().stat(ino)
      if (childName.toLowerCase() === wanted) return true
      if (inode?.displayName?.toLowerCase() === wanted) return true
    }
    return false
  }

  /** `name`, or `name (2)`, `name (3)`... before the extension, whichever is free in `dir`. */
  private uniqueName(
    dir: Step,
    name: string,
    kind: InodeKind,
    claimed?: Set<string>,
    free: (candidate: string) => boolean = () => true,
  ): string {
    if (!this.taken(dir, name, undefined, claimed) && free(name)) return name
    const dot = kind === 'file' ? name.lastIndexOf('.') : -1
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${extension}`
      if (!this.taken(dir, candidate, undefined, claimed) && free(candidate)) return candidate
    }
  }

  private checkSize(content: string | Blob, name: string) {
    if (typeof content === 'string' ? content.length > MAX_FILE_LENGTH : content.size > MAX_BLOB_SIZE) {
      throw new VfsError('EFBIG', name)
    }
  }

  /**
   * Creates a file, folder or symlink and resolves with its path. A taken
   * name is an error, unless `unique`, which numbers it instead. Files
   * without an extension get `.txt` unless `extension` is false.
   */
  create(
    path: string,
    {
      kind = 'file',
      content,
      target,
      unique = false,
      extension = true,
      flags,
      cwd,
    }: {
      kind?: InodeKind
      content?: string | Blob
      target?: string
      unique?: boolean
      extension?: boolean
      flags?: StoredInode['flags']
      cwd?: string
    } = {},
  ): Promise<string> {
    return this.serial(async () => {
      const [folder, name] = splitPath(path)
      const dir = this.writableDir(folder, { cwd })
      let clean = this.cleanName(name, kind === 'file' && extension ? '.txt' : undefined)
      if (this.taken(dir, clean)) {
        if (!unique) throw new VfsError('EEXIST', clean)
        clean = this.uniqueName(dir, clean, kind)
      }
      if (content !== undefined) this.checkSize(content, clean)
      const now = Date.now()
      const ino = newIno()
      const changes: Change[] = [
        {
          type: 'inode',
          inode: {
            ino,
            kind,
            ctime: now,
            mtime: now,
            ...(kind === 'symlink' && { target: target ?? '' }),
            ...(flags && { flags }),
            ...(kind === 'file' && { size: content === undefined ? 0 : sizeOf(content) }),
          },
        },
        { type: 'link', parent: dir.ino, name: clean, ino },
      ]
      if (kind === 'file') changes.push({ type: 'data', ino, content: content ?? '' })
      await this.apply(changes)
      return joinPath(dir.path, clean)
    })
  }

  mkdir(path: string, options?: { cwd?: string; unique?: boolean }) {
    return this.create(path, { ...options, kind: 'dir' })
  }

  symlink(target: string, path: string, options?: { cwd?: string }) {
    return this.create(path, { ...options, kind: 'symlink', target })
  }

  /** Replaces the content of one of the visitor's files, or creates it. */
  writeFile(path: string, content: string | Blob, options?: { cwd?: string }): Promise<string> {
    const existing = this.lookup(path, options)
    if (!existing) return this.create(path, { ...options, content, extension: false })
    return this.serial(async () => {
      const step = this.walk(path, { ...options, follow: true }).at(-1)!
      const shown = this.displayNameOf(step.name, step.inode, step.path)
      if (step.inode.kind === 'dir') throw new VfsError('EISDIR', shown)
      if (step.inode.layer !== 'upper' || isInside(step.path, TRASH_DIR)) throw new VfsError('EROFS', shown)
      if (this.isImmutable(step)) throw new VfsError('EPERM', shown)
      this.checkSize(content, shown)
      await this.apply([
        { type: 'inode', inode: { ...toStored(step.inode), mtime: Date.now(), size: sizeOf(content) } },
        { type: 'data', ino: step.ino, content },
      ])
      return step.path
    })
  }

  /** Marks one of the visitor's things as just changed, or creates an empty file, like `touch`. */
  touch(path: string, options?: { cwd?: string }): Promise<string> {
    if (!this.lookup(path, { ...options, follow: false })) return this.create(path, { ...options })
    return this.serial(async () => {
      const step = this.own(path, options)
      await this.apply([{ type: 'inode', inode: { ...toStored(step.inode), mtime: Date.now() } }])
      return step.path
    })
  }

  /** Renames or moves one thing to `to` (a full path), like `mv`. A taken name is an error. */
  rename(from: string, to: string, options?: { cwd?: string }): Promise<string> {
    return this.serial(async () => {
      const step = this.own(from, options)
      const shown = this.displayNameOf(step.name, step.inode, step.path)
      const [folder, name] = splitPath(to)
      const dir = this.writableDir(folder, options)
      const clean = this.cleanName(name)
      const parent = this.parentOf(step)
      if (parent === dir.ino && clean === step.name) return step.path
      if (isInside(step.path, TRASH_DIR)) throw new VfsError('EROFS', shown)
      if (clean !== step.name && this.isImmutable(step)) throw new VfsError('EPERM', shown)
      if (step.inode.kind === 'dir' && isInside(dir.path, step.path)) throw new VfsError('EINVAL', step.name, 'intoItself')
      if (this.taken(dir, clean, step.ino)) throw new VfsError('EEXIST', clean)
      // Only the dentry changes: what's inside a folder goes with it untouched.
      await this.apply([
        { type: 'unlink', parent, name: step.name },
        { type: 'link', parent: dir.ino, name: clean, ino: step.ino },
      ])
      return joinPath(dir.path, clean)
    })
  }

  /** The .trashinfo of something in the Trash, if there is one. */
  private trashInfoOf(name: string): Step | null {
    const info = this.walk(TRASH_INFO_PATH).at(-1)!
    const ino = this.driver().readdir(info.ino).get(`${name}.trashinfo`)
    const inode = ino && this.driver().stat(ino)
    return ino && inode ? { name: `${name}.trashinfo`, ino, inode, path: joinPath(TRASH_INFO_PATH, `${name}.trashinfo`) } : null
  }

  private forgetTrashInfo(step: Step, changes: Change[]) {
    if (this.parentOf(step) !== this.walk(TRASH_PATH).at(-1)!.ino) return
    const info = this.trashInfoOf(step.name)
    if (!info) return
    changes.push({ type: 'unlink', parent: this.parentOf(info), name: info.name }, { type: 'drop', ino: info.ino })
  }

  /**
   * Moves things into the folder `target`, keeping their inodes (so a desktop
   * icon keeps its place). A taken name gets a number, unless `unique` is
   * false, which makes it an error. Out of the Trash, this restores. Resolves
   * with how many moved.
   */
  move(paths: string[], target: string, { unique = true, cwd }: { unique?: boolean; cwd?: string } = {}): Promise<number> {
    return this.serial(async () => {
      const dir = this.writableDir(target, { cwd })
      const steps = this.ownAll(paths, { cwd })
      const claimed = new Set<string>()
      const changes: Change[] = []
      for (const step of steps) {
        const parent = this.parentOf(step)
        if (parent === dir.ino) continue
        if (step.inode.kind === 'dir' && isInside(dir.path, step.path)) throw new VfsError('EINVAL', step.name, 'intoItself')
        let name = step.name
        if (this.taken(dir, name, step.ino, claimed)) {
          if (!unique) throw new VfsError('EEXIST', name)
          name = this.uniqueName(dir, name, step.inode.kind, claimed)
        }
        claimed.add(name.toLowerCase())
        this.forgetTrashInfo(step, changes)
        changes.push({ type: 'unlink', parent, name: step.name }, { type: 'link', parent: dir.ino, name, ino: step.ino })
      }
      await this.apply(changes)
      return claimed.size
    })
  }

  /**
   * Moves things to the Trash, writing down where each was. Immutable things
   * stay where they are; if that's all there was, it's an error. Resolves
   * with how many went.
   */
  trash(paths: string[], options?: { cwd?: string }): Promise<number> {
    return this.serial(async () => {
      const own = this.ownAll(paths, options)
      const steps = own.filter((step) => !this.isImmutable(step) && !isInside(step.path, TRASH_DIR))
      const immutable = own.find(this.isImmutable)
      if (steps.length === 0 && immutable) {
        throw new VfsError('EPERM', this.displayNameOf(immutable.name, immutable.inode, immutable.path))
      }
      const files = this.walk(TRASH_PATH).at(-1)!
      const info = this.walk(TRASH_INFO_PATH).at(-1)!
      const infoNames = this.driver().readdir(info.ino)
      const claimed = new Set<string>()
      const changes: Change[] = []
      const now = Date.now()
      for (const step of steps) {
        const name = this.uniqueName(files, step.name, step.inode.kind, claimed, (candidate) => !infoNames.has(`${candidate}.trashinfo`))
        claimed.add(name.toLowerCase())
        const infoIno = newIno()
        const text = trashInfo(step.path, now)
        changes.push(
          { type: 'unlink', parent: this.parentOf(step), name: step.name },
          { type: 'link', parent: files.ino, name, ino: step.ino },
          { type: 'inode', inode: { ino: infoIno, kind: 'file', ctime: now, mtime: now, size: sizeOf(text) } },
          { type: 'link', parent: info.ino, name: `${name}.trashinfo`, ino: infoIno },
          { type: 'data', ino: infoIno, content: text },
        )
      }
      await this.apply(changes)
      return steps.length
    })
  }

  /** Puts things from the Trash back where they were, or on the desktop if that folder is gone. */
  restore(paths: string[], options?: { cwd?: string }): Promise<number> {
    return this.serial(async () => {
      const files = this.walk(TRASH_PATH).at(-1)!
      const steps = this.ownAll(paths, options).filter((step) => this.parentOf(step) === files.ino)
      const claimed = new Map<Ino, Set<string>>()
      const changes: Change[] = []
      for (const step of steps) {
        const info = this.trashInfoOf(step.name)
        const content = info ? await this.driver().read(info.ino) : ''
        const origin = typeof content === 'string' ? parseTrashInfo(content) : null
        const folder = origin ? splitPath(origin)[0] : DESKTOP_PATH
        const dir = this.canCreateIn(folder) ? this.writableDir(folder) : this.writableDir(DESKTOP_PATH)
        const taken = claimed.get(dir.ino) ?? new Set<string>()
        claimed.set(dir.ino, taken)
        const wanted = origin ? basename(origin) : step.name
        const name = this.uniqueName(dir, wanted, step.inode.kind, taken)
        taken.add(name.toLowerCase())
        this.forgetTrashInfo(step, changes)
        changes.push({ type: 'unlink', parent: files.ino, name: step.name }, { type: 'link', parent: dir.ino, name, ino: step.ino })
      }
      await this.apply(changes)
      return steps.length
    })
  }

  /** Every dentry and inode from `step` down, to delete. */
  private removal(step: Step, parent: string, changes: Change[]) {
    changes.push({ type: 'unlink', parent, name: step.name }, { type: 'drop', ino: step.ino })
    if (step.inode.kind !== 'dir') return
    for (const [name, ino] of this.driver().readdir(step.ino)) {
      const inode = this.driver().stat(ino)
      if (inode) this.removal({ name, ino, inode, path: joinPath(step.path, name) }, step.ino, changes)
    }
  }

  /** Deletes things, and whatever is inside them, for good. Resolves with how many went. */
  remove(paths: string[], options?: { cwd?: string }): Promise<number> {
    return this.serial(async () => {
      const steps = this.ownAll(paths, options)
      const immutable = steps.find(this.isImmutable)
      if (immutable) throw new VfsError('EPERM', this.displayNameOf(immutable.name, immutable.inode, immutable.path))
      const changes: Change[] = []
      for (const step of steps) {
        this.forgetTrashInfo(step, changes)
        this.removal(step, this.parentOf(step), changes)
      }
      await this.apply(changes)
      return steps.length
    })
  }

  /** Deletes everything in the Trash for good. Resolves with how many things there were. */
  emptyTrash(): Promise<number> {
    return this.serial(async () => {
      const changes: Change[] = []
      let count = 0
      for (const path of [TRASH_PATH, TRASH_INFO_PATH]) {
        const dir = this.walk(path).at(-1)!
        for (const [name, ino] of this.driver().upper.readdir(dir.ino)) {
          const inode = this.driver().stat(ino)
          if (!inode) continue
          if (path === TRASH_PATH) count++
          this.removal({ name, ino, inode, path: joinPath(path, name) }, dir.ino, changes)
        }
      }
      await this.apply(changes)
      return count
    })
  }
}

/** Whether `path` is something inside the Trash (not the Trash itself). */
export const isInTrash = (path: string) => path !== TRASH_PATH && isInside(path, TRASH_PATH)

/** How the visitor's layer refers to a folder of the résumé, as a dentry's parent. */
export const lowerRef = (path: string) => LOWER + path
