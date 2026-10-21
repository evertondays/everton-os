// The layers of the virtual file system. A path goes through the VFS (vfs.ts),
// which walks dentries (name → ino) to an inode (what the thing is) and asks a
// driver for its data. Nothing here touches the browser, so it runs in tests.

export type Ino = string

export type InodeKind = 'file' | 'dir' | 'symlink'

export type InodeFlag = 'immutable'

/** What a file holds: text, a Blob (the visitor's binaries) or a URL (the résumé's media). */
export type Content = string | Blob | URL

export interface Inode {
  ino: Ino
  kind: InodeKind
  /** Derived from the name (its extension) when the driver doesn't say. */
  mime?: string
  /** Symlinks only: an absolute path, or one relative to the link's folder. */
  target?: string
  size?: number
  /**
   * When it was created (Unix's birth time, not its change time): moving or
   * renaming keeps it, so the immutable things keep their order.
   */
  ctime: number
  /** When its content changed; for a folder, when an entry was added, removed or renamed. */
  mtime: number
  mode: 'ro' | 'rw'
  /** `immutable`: can't be renamed or deleted, but can be moved (like `chattr +i`, except for moving). */
  flags?: ReadonlyArray<InodeFlag>
  /** The name the interface shows; the real one is the dentry's. */
  displayName?: string
  /** Which layer of the overlay answered. 'upper' is the visitor's. */
  layer?: 'lower' | 'upper'
}

export interface FsDriver {
  readonly name: string
  /** Loads whatever stat and readdir need to answer synchronously. */
  init(): Promise<void>
  root(): Ino
  /** Undefined when there's no such inode. */
  stat(ino: Ino): Inode | undefined
  /** Children of a folder, in the order they should be listed. */
  readdir(dir: Ino): ReadonlyMap<string, Ino>
  read(ino: Ino): Promise<Content>
  /** Calls `listener` whenever the driver's tree changes on its own (language, another tab). */
  subscribe(listener: () => void): () => void
}

/** An inode as the visitor's layer stores it. */
export interface StoredInode {
  ino: Ino
  kind: InodeKind
  ctime: number
  mtime: number
  target?: string
  flags?: InodeFlag[]
  size?: number
}

export interface Dentry {
  /** The ino of the folder it's in: one of the visitor's, or `lower:<path>` for a folder of the résumé. */
  parent: string
  name: string
  ino: Ino
}

/** One step of a change to the visitor's layer. A list of them is applied as a whole, or not at all. */
export type Change =
  | { type: 'inode'; inode: StoredInode }
  | { type: 'link'; parent: string; name: string; ino: Ino }
  | { type: 'unlink'; parent: string; name: string }
  | { type: 'data'; ino: Ino; content: string | Blob }
  /** Deletes an inode and its data (its dentry goes with an `unlink`). */
  | { type: 'drop'; ino: Ino }
  | { type: 'meta'; key: string; value: unknown }

/** The writable layer: the visitor's files, in IndexedDB (idbfs) or in memory (memfs). */
export interface UpperFs extends FsDriver {
  /** Every dentry under `parent`, which may be a folder of the other layer (`lower:<path>`). */
  readdir(parent: string): ReadonlyMap<string, Ino>
  dentry(ino: Ino): Dentry | undefined
  stat(ino: Ino): (Inode & StoredInode) | undefined
  /** Applies `changes` in one transaction; the cache changes only once it's committed. */
  apply(changes: Change[]): Promise<void>
  getMeta(key: string): Promise<unknown>
}
