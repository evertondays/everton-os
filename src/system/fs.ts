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
import { useSettings } from './settings.ts'

// The virtual file system: a tree generated from the resume data.
// Every node has a stable `id` (used in paths, the same in every language)
// and a localized `name` (what the user sees and may also type in the Terminal).

export type FileType = 'resume' | 'markdown' | 'image' | 'link'

export interface FsFile {
  kind: 'file'
  id: string
  name: string
  type: FileType
  /** Markdown source. */
  content?: string
  /** Image URL. */
  src?: string
  /** Link target. */
  url?: string
}

export interface FsDir {
  kind: 'dir'
  id: string
  name: string
  children: FsNode[]
  /** Hidden from listings of its parent (the Trash). */
  hidden?: boolean
}

export type FsNode = FsFile | FsDir

export const RESUME_PATH = '/resume.pdf'
export const PROJECTS_PATH = '/projects'
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

  const trash: FsDir = {
    ...dir(
      'trash',
      t('fs.trash'),
      resume.meta.trash.map((item) => markdown(item.id, item.content, item.name)),
    ),
    hidden: true,
  }

  return dir('', t('fs.home'), [
    experience,
    projects,
    certificates,
    dir('photos', t('fs.photos'), images(resume.photos)),
    { kind: 'file', id: 'resume.pdf', name: t('fs.resume'), type: 'resume' },
    markdown('experiencia.md', experienceMarkdown(resume, locale), t('fs.experienceFile')),
    trash,
  ])
}

const cache = new Map<Locale, FsDir>()

export function getFs(locale: Locale): FsDir {
  let root = cache.get(locale)
  if (!root) {
    root = buildFs(getResume(locale), locale)
    cache.set(locale, root)
  }
  return root
}

export function useFs(): FsDir {
  return getFs(useSettings((s) => s.locale))
}

/**
 * Walks `path` (absolute, or relative to `cwd`) and returns the nodes from the
 * root down to the target, or null if it doesn't exist. Segments match a node's
 * id or its localized name, case-insensitively.
 */
export function walk(root: FsDir, path: string, cwd = '/'): FsNode[] | null {
  const chain: FsNode[] = [root]
  const segments = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/').filter(Boolean)
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

export function childPath(parent: string, child: FsNode): string {
  return `${parent === '/' ? '' : parent}/${child.id}`
}

export function visibleChildren(node: FsDir): FsNode[] {
  return node.children.filter((child) => child.kind === 'file' || !child.hidden)
}
