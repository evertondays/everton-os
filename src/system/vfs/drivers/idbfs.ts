import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { VfsError, isQuotaError } from '../errors.ts'
import type { Change, Content, Dentry, Ino, StoredInode } from '../types.ts'
import { MemFs } from './memfs.ts'

// The visitor's layer in IndexedDB. Metadata (inodes and dentries) is read
// whole at boot into memfs's cache, so stat and readdir stay synchronous; file
// data is read on demand. Every change is one transaction, and the cache only
// changes once it has committed.

interface Schema extends DBSchema {
  inodes: { key: string; value: StoredInode }
  dentries: { key: [string, string]; value: Dentry; indexes: { parent: string; ino: string } }
  data: { key: string; value: string | Blob }
  meta: { key: string; value: { key: string; value: unknown } }
}

export const DB_NAME = 'everton-os'
const CHANNEL = 'everton-os:fs'

export class IdbFs extends MemFs {
  readonly name = 'idbfs'
  private db: IDBPDatabase<Schema> | null = null
  private channel: BroadcastChannel | null = null
  private readonly dbName: string

  constructor(dbName = DB_NAME) {
    super()
    this.dbName = dbName
  }

  async init() {
    this.db = await openDB<Schema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('inodes', { keyPath: 'ino' })
        const dentries = db.createObjectStore('dentries', { keyPath: ['parent', 'name'] })
        dentries.createIndex('parent', 'parent')
        dentries.createIndex('ino', 'ino')
        db.createObjectStore('data')
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
    await this.reload()
    // Another tab changed the files: read the metadata again.
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL)
      this.channel.onmessage = () => {
        void this.reload().then(() => this.emit())
      }
    }
  }

  close() {
    this.channel?.close()
    this.db?.close()
  }

  private async reload() {
    const db = this.database()
    const tx = db.transaction(['inodes', 'dentries'])
    const [inodes, dentries] = await Promise.all([tx.objectStore('inodes').getAll(), tx.objectStore('dentries').getAll()])
    this.load(inodes, dentries)
    // Data is read again on demand.
    this.data.clear()
  }

  private database() {
    if (!this.db) throw new Error('idbfs used before init()')
    return this.db
  }

  async read(ino: Ino): Promise<Content> {
    if (!this.inodes.has(ino)) throw new VfsError('ENOENT', ino)
    const cached = this.data.get(ino)
    if (cached !== undefined) return cached
    const content = (await this.database().get('data', ino)) ?? ''
    // Only if nothing changed it in the meantime.
    if (this.inodes.has(ino) && !this.data.has(ino)) this.data.set(ino, content)
    return content
  }

  async getMeta(key: string): Promise<unknown> {
    return (await this.database().get('meta', key))?.value
  }

  async apply(changes: Change[]) {
    const tx = this.database().transaction(['inodes', 'dentries', 'data', 'meta'], 'readwrite')
    const writes: Promise<unknown>[] = []
    try {
      for (const change of changes) {
        switch (change.type) {
          case 'inode':
            writes.push(tx.objectStore('inodes').put(change.inode))
            break
          case 'link':
            writes.push(tx.objectStore('dentries').put({ parent: change.parent, name: change.name, ino: change.ino }))
            break
          case 'unlink':
            writes.push(tx.objectStore('dentries').delete([change.parent, change.name]))
            break
          case 'data':
            writes.push(tx.objectStore('data').put(change.content, change.ino))
            break
          case 'drop':
            writes.push(tx.objectStore('inodes').delete(change.ino), tx.objectStore('data').delete(change.ino))
            break
          case 'meta':
            writes.push(tx.objectStore('meta').put({ key: change.key, value: change.value }))
            break
        }
      }
      await Promise.all([...writes, tx.done])
    } catch (error) {
      // Whatever was still pending fails with the abort; that's expected.
      for (const pending of [...writes, tx.done]) pending.catch(() => undefined)
      try {
        tx.abort()
      } catch {
        // Already aborted by the error.
      }
      // A full storage refuses the change instead of losing it later.
      if (isQuotaError(error) || isQuotaError(tx.error)) throw new VfsError('ENOSPC', '')
      throw error
    }
    this.applyToCache(changes)
    this.emit()
    this.channel?.postMessage('changed')
  }
}
