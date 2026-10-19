import { openDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import raw from '../../data/curriculo.json'
import { type Locale, localize } from '../../data/localize.ts'
import type { Resume } from '../../data/types.ts'
import { IdbFs } from './drivers/idbfs.ts'
import { MemFs } from './drivers/memfs.ts'
import { OverlayFs } from './drivers/overlayfs.ts'
import { ResumeFs } from './drivers/resumefs.ts'
import { VfsError } from './errors.ts'
import { seed } from './seed.ts'
import type { UpperFs } from './types.ts'
import { TRASH_INFO_PATH, TRASH_PATH, Vfs } from './vfs.ts'

const resumeFor = (locale: Locale) => localize(raw, locale) as Resume
const appNames: Record<string, string> = { contact: 'Contato', terminal: 'Terminal' }

let databases = 0
const open: IdbFs[] = []

async function mount(upper: UpperFs = new MemFs(), legacy: string | null = null) {
  const resumefs = new ResumeFs(resumeFor, 'pt')
  await upper.init()
  await seed(upper, legacy)
  const vfs = new Vfs({ launcherName: (id) => appNames[id] })
  vfs.mount(new OverlayFs(resumefs, upper))
  return { vfs, resumefs, upper }
}

function idbfs(name = `test-${++databases}`) {
  const fs = new IdbFs(name)
  open.push(fs)
  return fs
}

const code = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    if (error instanceof VfsError) return error.code
    throw error
  }
  return 'ok'
}

const syncCode = (action: () => unknown) => {
  try {
    action()
  } catch (error) {
    if (error instanceof VfsError) return error.code
    throw error
  }
  return 'ok'
}

afterEach(() => {
  open.splice(0).forEach((fs) => fs.close())
  vi.restoreAllMocks()
})

describe('path resolution', () => {
  it('resolves absolute and relative paths, `..` above the root and `~`', async () => {
    const { vfs } = await mount()
    expect(vfs.stat('/projects/everton-os/README.md').path).toBe('/projects/everton-os/README.md')
    expect(vfs.stat('everton-os/README.md', { cwd: '/projects' }).path).toBe('/projects/everton-os/README.md')
    expect(vfs.stat('../../..', { cwd: '/projects' }).path).toBe('/')
    expect(vfs.stat('~').path).toBe('/')
    expect(vfs.stat('~/projects').path).toBe('/projects')
    expect(syncCode(() => vfs.stat('/nope'))).toBe('ENOENT')
    expect(syncCode(() => vfs.stat('/resume.pdf/x'))).toBe('ENOTDIR')
  })

  it('follows relative symlinks and chains of them, and gives up on loops', async () => {
    const { vfs } = await mount()
    await vfs.symlink('../projects', '/desktop/relative')
    await vfs.symlink('relative', '/desktop/chained')
    expect(vfs.stat('/desktop/relative').path).toBe('/projects')
    expect(vfs.stat('/desktop/chained/everton-os').path).toBe('/projects/everton-os')
    expect(vfs.lstat('/desktop/chained').inode.kind).toBe('symlink')
    expect(vfs.readlink('/desktop/chained')).toBe('relative')

    await vfs.symlink('loop-b', '/desktop/loop-a')
    await vfs.symlink('loop-a', '/desktop/loop-b')
    expect(syncCode(() => vfs.stat('/desktop/loop-a'))).toBe('ELOOP')
  })

  it('is strict about names, and lenient (display names, no case or accents) only when asked', async () => {
    const { vfs } = await mount()
    expect(vfs.lookup('/Projetos')).toBeNull()
    expect(vfs.lookup('/projetos', { lenient: true })?.path).toBe('/projects')
    expect(vfs.lookup('/curriculo.pdf', { lenient: true })?.path).toBe('/resume.pdf')
  })
})

describe('overlay', () => {
  it('lists the résumé and the visitor’s things together', async () => {
    const { vfs } = await mount()
    await vfs.mkdir('/projects/mine')
    const entries = vfs.readdir('/projects')
    expect(entries.map((entry) => [entry.name, entry.inode.layer])).toEqual([
      ['everton-os', 'lower'],
      ['resolve-ai', 'lower'],
      ['lemonade-music-player', 'lower'],
      ['snotra-books', 'lower'],
      ['mine', 'upper'],
    ])
  })

  it('refuses names the résumé already has, and writing to the résumé', async () => {
    const { vfs } = await mount()
    expect(await code(vfs.mkdir('/projects/everton-os'))).toBe('EEXIST')
    expect(await code(vfs.writeFile('/experiencia.md', 'x'))).toBe('EROFS')
    expect(await code(vfs.rename('/experiencia.md', '/x.md'))).toBe('EROFS')
    expect(await code(vfs.trash(['/projects']))).toBe('EROFS')
  })

  it('hides dotfiles unless asked', async () => {
    const { vfs } = await mount()
    expect(vfs.readdir('/').some((entry) => entry.name === '.trash')).toBe(false)
    expect(vfs.readdir('/', { all: true }).some((entry) => entry.name === '.trash')).toBe(true)
  })
})

describe('changes', () => {
  it('renaming a folder with three levels inside changes a single dentry', async () => {
    const upper = idbfs()
    const { vfs } = await mount(upper)
    await vfs.mkdir('/desktop/a')
    await vfs.mkdir('/desktop/a/b')
    await vfs.mkdir('/desktop/a/b/c')
    await vfs.writeFile('/desktop/a/b/c/x.txt', 'hello')

    const db = await openDB(`test-${databases}`)
    const before = (await db.getAll('dentries')).map((row) => JSON.stringify(row))
    await vfs.rename('/desktop/a', '/desktop/z')
    const after = (await db.getAll('dentries')).map((row) => JSON.stringify(row))
    db.close()

    expect(before.filter((row) => !after.includes(row))).toHaveLength(1)
    expect(after.filter((row) => !before.includes(row))).toHaveLength(1)
    expect(await vfs.readFile('/desktop/z/b/c/x.txt')).toBe('hello')
  })

  it('moves all or nothing', async () => {
    const { vfs } = await mount()
    for (const name of ['a.txt', 'b.txt', 'c.txt']) await vfs.writeFile(`/desktop/${name}`, name)
    await vfs.mkdir('/desktop/dest')
    await vfs.writeFile('/desktop/dest/c.txt', 'already here')

    const paths = ['/desktop/a.txt', '/desktop/b.txt', '/desktop/c.txt']
    expect(await code(vfs.move(paths, '/desktop/dest', { unique: false }))).toBe('EEXIST')
    expect(vfs.lookup('/desktop/a.txt')).not.toBeNull()
    expect(vfs.lookup('/desktop/dest/a.txt')).toBeNull()
    expect(await vfs.readFile('/desktop/dest/c.txt')).toBe('already here')
  })

  it('turns a full storage into ENOSPC and leaves the cache as it was', async () => {
    const { vfs } = await mount(idbfs())
    const version = vfs.version
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(await code(vfs.writeFile('/desktop/big.txt', 'x'))).toBe('ENOSPC')
    expect(vfs.lookup('/desktop/big.txt')).toBeNull()
    expect(vfs.version).toBe(version)
  })

  it('keeps everything across a reload', async () => {
    const name = `test-${++databases}`
    const first = await mount(idbfs(name))
    await first.vfs.mkdir('/desktop/folder')
    await first.vfs.writeFile('/desktop/folder/note.txt', 'kept')
    open.splice(0).forEach((fs) => fs.close())

    const { vfs } = await mount(idbfs(name))
    expect(await vfs.readFile('/desktop/folder/note.txt')).toBe('kept')
    // Seeded once: the shortcuts aren't added again.
    expect(vfs.readdir('/desktop').map((entry) => entry.name)).toEqual([
      'resume.pdf',
      'projects',
      'contact.app',
      'terminal.app',
      'folder',
    ])
  })
})

describe('shortcuts', () => {
  it('starts with symlinks and launchers that can be moved but not renamed or deleted', async () => {
    const { vfs } = await mount()
    expect(vfs.readdir('/desktop').map((entry) => [entry.name, entry.displayName, entry.inode.kind])).toEqual([
      ['resume.pdf', 'Currículo.pdf', 'symlink'],
      ['projects', 'Projetos', 'symlink'],
      ['contact.app', 'Contato', 'file'],
      ['terminal.app', 'Terminal', 'file'],
    ])
    expect(await vfs.readFile('/desktop/contact.app')).toBe('contact')
    expect(await code(vfs.rename('/desktop/resume.pdf', '/desktop/cv.pdf'))).toBe('EPERM')
    expect(await code(vfs.trash(['/desktop/resume.pdf']))).toBe('EPERM')
    expect(await code(vfs.remove(['/desktop/terminal.app']))).toBe('EPERM')

    await vfs.mkdir('/desktop/folder')
    await vfs.move(['/desktop/resume.pdf'], '/desktop/folder')
    expect(vfs.realpath('/desktop/folder/resume.pdf')).toBe('/resume.pdf')
    expect(vfs.lstat('/desktop/folder/resume.pdf').inode.ino).toBe('shortcut-resume')
  })
})

describe('trash', () => {
  it('moves things to the Trash and back where they were', async () => {
    const { vfs } = await mount()
    await vfs.mkdir('/desktop/folder')
    await vfs.writeFile('/desktop/folder/note.txt', 'text')
    await vfs.trash(['/desktop/folder/note.txt'])

    expect(vfs.lookup('/desktop/folder/note.txt')).toBeNull()
    expect(vfs.lookup(`${TRASH_PATH}/note.txt`)).not.toBeNull()
    expect(await vfs.readFile(`${TRASH_INFO_PATH}/note.txt.trashinfo`)).toMatch(/^\[Trash Info\]\nPath=\/desktop\/folder\/note\.txt\n/)

    await vfs.restore([`${TRASH_PATH}/note.txt`])
    expect(await vfs.readFile('/desktop/folder/note.txt')).toBe('text')
    expect(vfs.readdir(TRASH_PATH)).toHaveLength(0)
    expect(vfs.readdir(TRASH_INFO_PATH)).toHaveLength(0)
  })

  it('restores to the desktop when the folder is gone, and empties for good', async () => {
    const { vfs } = await mount()
    await vfs.mkdir('/desktop/folder')
    await vfs.writeFile('/desktop/folder/note.txt', 'text')
    await vfs.trash(['/desktop/folder/note.txt'])
    await vfs.trash(['/desktop/folder'])
    await vfs.remove([`${TRASH_PATH}/folder`])
    await vfs.restore([`${TRASH_PATH}/note.txt`])
    expect(await vfs.readFile('/desktop/note.txt')).toBe('text')

    await vfs.writeFile('/desktop/other.txt', '')
    await vfs.trash(['/desktop/other.txt'])
    expect(await vfs.emptyTrash()).toBe(1)
    expect(vfs.readdir(TRASH_PATH)).toHaveLength(0)
    expect(vfs.readdir(TRASH_INFO_PATH)).toHaveLength(0)
  })

  it('numbers names already taken in the Trash', async () => {
    const { vfs } = await mount()
    await vfs.writeFile('/desktop/a.txt', '1')
    await vfs.trash(['/desktop/a.txt'])
    await vfs.writeFile('/desktop/a.txt', '2')
    await vfs.trash(['/desktop/a.txt'])
    expect(vfs.readdir(TRASH_PATH).map((entry) => entry.name)).toEqual(['a (2).txt', 'a.txt'])
  })
})

describe('migration from localStorage v1', () => {
  const now = 1_700_000_000_000
  const fixture = JSON.stringify({
    version: 1,
    seeded: true,
    nodes: [
      { key: 'shortcut-resume', kind: 'file', name: 'resume.pdf', parent: '/desktop', shortcut: 'resume', createdAt: 0, updatedAt: 0 },
      { key: 'shortcut-projects', kind: 'file', name: 'projects', parent: '/desktop/pasta', shortcut: 'projects', createdAt: 0, updatedAt: 0 },
      { key: 'shortcut-contact', kind: 'file', name: 'contact', parent: '/desktop', shortcut: 'contact', createdAt: 0, updatedAt: 0 },
      { key: 'shortcut-terminal', kind: 'file', name: 'terminal', parent: '/desktop', shortcut: 'terminal', createdAt: 0, updatedAt: 0 },
      { key: 'k1', kind: 'file', name: 'notas.txt', parent: '/desktop', content: 'oi', createdAt: now, updatedAt: now },
      { key: 'k2', kind: 'dir', name: 'pasta', parent: '/desktop', createdAt: now, updatedAt: now },
      { key: 'k3', kind: 'dir', name: 'sub', parent: '/desktop/pasta', createdAt: now, updatedAt: now },
      { key: 'k4', kind: 'file', name: 'fundo.txt', parent: '/desktop/pasta/sub', content: 'fundo', createdAt: now, updatedAt: now },
      { key: 'k5', kind: 'file', name: 'velho.txt', parent: '/trash', content: 'v', trashedFrom: '/desktop', createdAt: now, updatedAt: now },
    ],
  })

  it('brings files, folders, the Trash and moved shortcuts over', async () => {
    const { vfs } = await mount(new MemFs(), fixture)
    expect(await vfs.readFile('/desktop/notas.txt')).toBe('oi')
    expect(await vfs.readFile('/desktop/pasta/sub/fundo.txt')).toBe('fundo')
    expect(vfs.stat('/desktop/notas.txt').inode.ino).toBe('k1')
    expect(vfs.realpath('/desktop/pasta/projects')).toBe('/projects')
    expect(vfs.lstat('/desktop/pasta/projects').inode.flags).toEqual(['immutable'])
    expect(await vfs.readFile('/desktop/terminal.app')).toBe('terminal')
    expect(await vfs.readFile(`${TRASH_INFO_PATH}/velho.txt.trashinfo`)).toContain('Path=/desktop/velho.txt')

    await vfs.restore([`${TRASH_PATH}/velho.txt`])
    expect(await vfs.readFile('/desktop/velho.txt')).toBe('v')
  })

  it('runs once', async () => {
    const name = `test-${++databases}`
    const first = await mount(idbfs(name), fixture)
    const count = (vfs: Vfs) => vfs.readdir('/desktop').length + vfs.readdir('/desktop/pasta').length
    const before = count(first.vfs)
    open.splice(0).forEach((fs) => fs.close())

    const second = await mount(idbfs(name), fixture)
    expect(count(second.vfs)).toBe(before)
    expect(await second.upper.getMeta('migratedFrom')).toBe('localStorage:v1')
  })

  it('adds the shortcuts a visitor who never saved anything didn’t have yet', async () => {
    const { vfs } = await mount(new MemFs(), JSON.stringify({ nodes: [] }))
    expect(vfs.readdir('/desktop').map((entry) => entry.name)).toEqual(['resume.pdf', 'projects', 'contact.app', 'terminal.app'])
  })
})

describe('language', () => {
  it('changes display names but not inodes', async () => {
    const { vfs, resumefs } = await mount()
    const before = vfs.stat('/projects')
    expect(before.displayName).toBe('Projetos')
    resumefs.setLocale('en')
    const after = vfs.stat('/projects')
    expect(after.displayName).toBe('Projects')
    expect(after.inode.ino).toBe(before.inode.ino)
    expect(vfs.stat('/desktop/projects').displayName).toBe('Projects')
  })
})
