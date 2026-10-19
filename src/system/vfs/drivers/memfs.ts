import { VfsError } from '../errors.ts'
import type { Change, Content, Dentry, Ino, Inode, StoredInode, UpperFs } from '../types.ts'

// The visitor's layer, in memory: what's used when IndexedDB is blocked (the
// files last until the page closes) and the cache idbfs keeps in front of it.

export class MemFs implements UpperFs {
  readonly name: string = 'memfs'
  protected inodes = new Map<Ino, StoredInode>()
  protected dentries = new Map<Ino, Dentry>()
  /** parent → name → ino */
  protected children = new Map<string, Map<string, Ino>>()
  protected data = new Map<Ino, string | Blob>()
  protected meta = new Map<string, unknown>()
  private listeners = new Set<() => void>()

  async init() {}

  /** The upper layer has no tree of its own: its dentries hang from the lower layer's folders. */
  root(): Ino {
    return 'lower:/'
  }

  stat(ino: Ino): (Inode & StoredInode) | undefined {
    const inode = this.inodes.get(ino)
    return inode && { ...inode, mode: 'rw', layer: 'upper' }
  }

  readdir(parent: string): ReadonlyMap<string, Ino> {
    return this.children.get(parent) ?? new Map()
  }

  dentry(ino: Ino): Dentry | undefined {
    return this.dentries.get(ino)
  }

  async read(ino: Ino): Promise<Content> {
    if (!this.inodes.has(ino)) throw new VfsError('ENOENT', ino)
    return this.data.get(ino) ?? ''
  }

  async getMeta(key: string): Promise<unknown> {
    return this.meta.get(key)
  }

  async apply(changes: Change[]) {
    this.applyToCache(changes)
    this.emit()
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected emit() {
    this.listeners.forEach((listener) => listener())
  }

  protected applyToCache(changes: Change[]) {
    for (const change of changes) {
      switch (change.type) {
        case 'inode':
          this.inodes.set(change.inode.ino, change.inode)
          break
        case 'link':
          this.link({ parent: change.parent, name: change.name, ino: change.ino })
          break
        case 'unlink': {
          const ino = this.children.get(change.parent)?.get(change.name)
          this.children.get(change.parent)?.delete(change.name)
          if (ino && this.dentries.get(ino)?.parent === change.parent) this.dentries.delete(ino)
          break
        }
        case 'data':
          this.data.set(change.ino, change.content)
          break
        case 'drop':
          this.inodes.delete(change.ino)
          this.data.delete(change.ino)
          break
        case 'meta':
          this.meta.set(change.key, change.value)
          break
      }
    }
  }

  protected link(dentry: Dentry) {
    let names = this.children.get(dentry.parent)
    if (!names) {
      names = new Map()
      this.children.set(dentry.parent, names)
    }
    names.set(dentry.name, dentry.ino)
    this.dentries.set(dentry.ino, dentry)
  }

  /** Replaces the whole cache (idbfs, after loading or when another tab changed something). */
  protected load(inodes: StoredInode[], dentries: Dentry[]) {
    this.inodes = new Map(inodes.map((inode) => [inode.ino, inode]))
    this.dentries = new Map()
    this.children = new Map()
    for (const dentry of dentries) this.link(dentry)
  }
}
