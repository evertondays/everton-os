import { type Locale } from '../data/localize.ts'
import { getResume } from '../data/resume.ts'
import type { Media, Resume } from '../data/types.ts'
import { translate } from '../i18n/dict.ts'
import {
  certificateMarkdown,
  educationMarkdown,
  experienceMarkdown,
  projectMarkdown,
  workMarkdown,
} from './content.ts'
import { mediaSrc, placeholderImage } from './media.ts'
import { settings, useSettings } from './settings.ts'
import { useStore } from './store.ts'
import { type UserNode, userFs } from './userFs.ts'

// The virtual file system: a read-only tree generated from the resume data,
// with the visitor's own files and folders (userFs.ts) laid over it.
// Every node has a stable `id` (used in paths, the same in every language)
// and a localized `name` (what the user sees and may also type in the Terminal).

/** `text` is a file the visitor made; the others come from the résumé. */
export type FileType = 'resume' | 'markdown' | 'image' | 'link' | 'text'

export interface FsFile {
  kind: 'file'
  id: string
  name: string
  type: FileType
  /** Markdown source, or the text of a visitor's file. */
  content?: string
  /** Image URL. */
  src?: string
  /** Link target. */
  url?: string
  /** Set on the visitor's own nodes, which are the only ones that can change: their key in userFs. */
  key?: string
}

export interface FsDir {
  kind: 'dir'
  id: string
  name: string
  children: FsNode[]
  /** Hidden from listings of its parent (the Trash). */
  hidden?: boolean
  key?: string
}

export type FsNode = FsFile | FsDir

export const RESUME_PATH = '/resume.pdf'
export const PROJECTS_PATH = '/projects'
export const DESKTOP_PATH = '/desktop'
export const TRASH_PATH = '/trash'

const dir = (id: string, name: string, children: FsNode[]): FsDir => ({ kind: 'dir', id, name, children })

const markdown = (id: string, content: string, name = id): FsFile => ({
  kind: 'file',
  id,
  name,
  type: 'markdown',
  content,
})

const link = (id: string, url: string): FsFile => ({ kind: 'file', id, name: id, type: 'link', url })

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function images(items: Media[]): FsFile[] {
  return items.map((media, index) => ({
    kind: 'file',
    id: `${slug(media.caption) || index + 1}.png`,
    name: `${media.caption}.png`,
    type: 'image',
    src: mediaSrc(media),
  }))
}

export function buildFs(resume: Resume, locale: Locale): FsDir {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)

  const experience = dir(
    'experience',
    t('fs.experience'),
    resume.work.map((work) => markdown(`${work.id}.md`, workMarkdown(work, locale))),
  )

  const projects = dir(
    'projects',
    t('fs.projects'),
    resume.projects.map((project) =>
      dir(project.id, project.name, [
        markdown('README.md', projectMarkdown(project, locale)),
        ...(project.demo ? [link('demo.url', project.demo)] : []),
        ...(project.url ? [link(`${t('fs.repo')}.url`, project.url)] : []),
        ...images(project.images),
      ]),
    ),
  )

  const certificates = dir('certificates', t('fs.certificates'), [
    markdown('education.md', educationMarkdown(resume.education, locale), `${t('fs.education')}.md`),
    ...resume.certificates.flatMap((certificate): FsFile[] => [
      markdown(`${certificate.id}.md`, certificateMarkdown(certificate, locale)),
      {
        kind: 'file',
        id: `${certificate.id}.png`,
        name: `${certificate.name}.png`,
        type: 'image',
        src: certificate.image ? mediaSrc({ src: certificate.image, caption: certificate.name }) : placeholderImage(certificate.name),
      },
    ]),
  ])

  // Starts empty; only what the visitor deletes goes in.
  const trash: FsDir = { ...dir('trash', t('fs.trash'), []), hidden: true }

  return dir('', t('fs.home'), [
    // Where the files made on the desktop go; it starts empty.
    dir('desktop', t('fs.desktop'), []),
    experience,
    projects,
    certificates,
    dir('photos', t('fs.photos'), images(resume.photos)),
    { kind: 'file', id: 'resume.pdf', name: t('fs.resume'), type: 'resume' },
    markdown('experiencia.md', experienceMarkdown(resume, locale), t('fs.experienceFile')),
    trash,
  ])
}

/** Adds the visitor's nodes to a copy of `base`, each under the folder its `parent` path names. */
function overlay(base: FsDir, nodes: UserNode[]): FsDir {
  const byParent = new Map<string, UserNode[]>()
  for (const node of nodes) byParent.set(node.parent, [...(byParent.get(node.parent) ?? []), node])

  const toFsNode = (node: UserNode, path: string): FsNode =>
    node.kind === 'dir'
      ? attach({ kind: 'dir', id: node.name, name: node.name, children: [], key: node.key }, path)
      : { kind: 'file', id: node.name, name: node.name, type: 'text', content: node.content ?? '', key: node.key }

  function attach(folder: FsDir, path: string): FsDir {
    const own = (byParent.get(path) ?? [])
      .toSorted((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
      .map((node) => toFsNode(node, joinPath(path, node.name)))
    const children = folder.children.map((child) =>
      child.kind === 'dir' ? attach(child, childPath(path, child)) : child,
    )
    return { ...folder, children: [...children, ...own] }
  }

  return attach(base, '/')
}

const cache = new Map<Locale, FsDir>()
const merged = new Map<Locale, { nodes: UserNode[]; root: FsDir }>()

/** The résumé tree alone, without the visitor's nodes. */
function getBaseFs(locale: Locale): FsDir {
  let root = cache.get(locale)
  if (!root) {
    root = buildFs(getResume(locale), locale)
    cache.set(locale, root)
  }
  return root
}

/** The whole tree, rebuilt only when the visitor's nodes change. */
export function getFs(locale: Locale): FsDir {
  const { nodes } = userFs.get()
  const hit = merged.get(locale)
  if (hit?.nodes === nodes) return hit.root
  const root = overlay(getBaseFs(locale), nodes)
  merged.set(locale, { nodes, root })
  return root
}

export function useFs(): FsDir {
  const locale = useSettings((s) => s.locale)
  // Subscribes to the visitor's nodes; getFs reads them.
  useStore(userFs, (state) => state.nodes)
  return getFs(locale)
}

/**
 * Walks `path` (absolute, or relative to `cwd`) and returns the nodes from the
 * root down to the target, or null if it doesn't exist. Segments match a node's
 * id or its localized name, case-insensitively.
 */
export function walk(root: FsDir, path: string, cwd = '/'): FsNode[] | null {
  const chain: FsNode[] = [root]
  // `~` is the home folder, as the Terminal's prompt shows it.
  const home = path === '~' || path.startsWith('~/') ? path.slice(1) || '/' : path
  const segments = (home.startsWith('/') ? home : `${cwd}/${home}`).split('/').filter(Boolean)
  for (const segment of segments) {
    if (segment === '.') continue
    if (segment === '..') {
      if (chain.length > 1) chain.pop()
      continue
    }
    const current = chain[chain.length - 1]
    if (current.kind !== 'dir') return null
    const wanted = segment.toLowerCase()
    const next = current.children.find(
      (child) => child.id.toLowerCase() === wanted || child.name.toLowerCase() === wanted,
    )
    if (!next) return null
    chain.push(next)
  }
  return chain
}

/** The canonical (id-based) path of a chain returned by `walk`. */
export function chainPath(chain: FsNode[]): string {
  return `/${chain
    .slice(1)
    .map((node) => node.id)
    .join('/')}`
}

/**
 * `path` as it may be sent to analytics: a path through the visitor's own
 * files or folders is cut at the first of them, so their names never leave the browser.
 */
export function publicPath(path: string): string {
  const chain = walk(getFs(settings.get().locale), path)
  const own = chain?.findIndex((node) => node.key !== undefined) ?? -1
  return chain && own !== -1 ? `${chainPath(chain.slice(0, own))}/*`.replace('//', '/') : path
}

/** App arguments with their path made public (see publicPath), for the app_opened event. */
export function publicArgs<T extends { path?: string }>(args?: T): T | undefined {
  return args?.path ? { ...args, path: publicPath(args.path) } : args
}

export function joinPath(parent: string, id: string): string {
  return `${parent === '/' ? '' : parent}/${id}`
}

export function childPath(parent: string, child: FsNode): string {
  return joinPath(parent, child.id)
}

/** The folder part and the last segment of a path, as typed: `a/b/c.txt` → [`a/b`, `c.txt`]. */
export function splitPath(path: string): [string, string] {
  const trimmed = path.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  if (slash === -1) return ['.', trimmed]
  return [trimmed.slice(0, slash) || '/', trimmed.slice(slash + 1)]
}

export function visibleChildren(node: FsDir): FsNode[] {
  return node.children.filter((child) => child.kind === 'file' || !child.hidden)
}
