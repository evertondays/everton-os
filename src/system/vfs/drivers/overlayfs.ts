import type { Change, Content, Dentry, FsDriver, Ino, Inode, UpperFs } from '../types.ts'

// The résumé (lower, read-only) with the visitor's files (upper) laid over it.
// The lower layer's inodes are `lower:<its ino>`; the upper's dentries hang
// from either layer's folders. Listing a folder of the résumé shows both.

export const LOWER = 'lower:'

export const isLower = (ino: Ino) => ino.startsWith(LOWER)

export class OverlayFs implements FsDriver {
  readonly name = 'overlayfs'
  readonly lower: FsDriver
  readonly upper: UpperFs

  constructor(lower: FsDriver, upper: UpperFs) {
    this.lower = lower
    this.upper = upper
  }

  async init() {
    await Promise.all([this.lower.init(), this.upper.init()])
  }

  root(): Ino {
    return LOWER + this.lower.root()
  }

  stat(ino: Ino): Inode | undefined {
    if (isLower(ino)) {
      const inode = this.lower.stat(ino.slice(LOWER.length))
      return inode && { ...inode, ino, mode: 'ro', layer: 'lower' }
    }
    return this.upper.stat(ino)
  }

  readdir(dir: Ino): ReadonlyMap<string, Ino> {
    const own = this.upper.readdir(dir)
    if (!isLower(dir)) return own
    const merged = new Map<string, Ino>()
    for (const [name, ino] of this.lower.readdir(dir.slice(LOWER.length))) merged.set(name, LOWER + ino)
    // The résumé's names win; the VFS never lets the visitor take one of them.
    for (const [name, ino] of own) if (!merged.has(name)) merged.set(name, ino)
    return merged
  }

  /** Where an upper inode is linked (lower inodes are found by their path). */
  dentry(ino: Ino): Dentry | undefined {
    return this.upper.dentry(ino)
  }

  read(ino: Ino): Promise<Content> {
    return isLower(ino) ? this.lower.read(ino.slice(LOWER.length)) : this.upper.read(ino)
  }

  apply(changes: Change[]) {
    return this.upper.apply(changes)
  }

  subscribe(listener: () => void) {
    const offLower = this.lower.subscribe(listener)
    const offUpper = this.upper.subscribe(listener)
    return () => {
      offLower()
      offUpper()
    }
  }
}
