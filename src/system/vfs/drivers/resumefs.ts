import type { Locale } from '../../../data/localize.ts'
import type { Media, Resume } from '../../../data/types.ts'
import { type TKey, translate } from '../../../i18n/dict.ts'
import {
  certificateMarkdown,
  educationMarkdown,
  experienceMarkdown,
  projectMarkdown,
  resumeText,
  workMarkdown,
} from '../../content.ts'
import { assetUrl, mediaSrc, placeholderImage } from '../../media.ts'
import { VfsError } from '../errors.ts'
import { mimeOf } from '../mime.ts'
import { joinPath } from '../path.ts'
import type { Content, FsDriver, Ino, Inode, InodeKind } from '../types.ts'

// The read-only layer generated from the résumé. Real names are fixed (they
// are what paths are made of, in every language); what the interface shows
// comes from `displayName`, which follows the language. An inode's number is
// its path here, so it never changes.

interface Node {
  inode: Inode
  children?: Map<string, Ino>
  content?: Content
}

interface Spec {
  name: string
  displayName?: string
  /** A folder's children. */
  children?: Spec[]
  /** A file's content. */
  content?: Content
  mime?: string
}

/** When the layer was "mounted": the date its files show. */
const MOUNTED = Date.now()

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const baseHref = () => globalThis.location?.href ?? 'http://localhost/'

const toUrl = (src: string) => new URL(src, baseHref())

const dir = (name: string, displayName: string | undefined, children: Spec[]): Spec => ({ name, displayName, children })

const markdown = (name: string, content: string, displayName?: string): Spec => ({ name, displayName, content })

/**
 * Image files. Their real names come from the captions in `names` (the
 * résumé in its first language), so they read the same in every language.
 */
function images(items: Media[], names: Media[]): Spec[] {
  return items.map((media, index) => ({
    name: `${slug(names[index]?.caption ?? media.caption) || index + 1}.png`,
    displayName: `${media.caption}.png`,
    content: toUrl(mediaSrc(media)),
  }))
}

export function resumeTree(resume: Resume, canonical: Resume, locale: Locale): Spec {
  const t = (key: TKey) => translate(locale, key)

  return dir('', t('fs.home'), [
    // Where the desktop's icons live. It starts empty: the visitor's layer fills it.
    dir('desktop', t('fs.desktop'), []),
    dir(
      'experience',
      t('fs.experience'),
      resume.work.map((work) => markdown(`${work.id}.md`, workMarkdown(work, locale))),
    ),
    dir(
      'projects',
      t('fs.projects'),
      resume.projects.map((project, index) =>
        dir(project.id, project.name, [
          markdown('README.md', projectMarkdown(project, locale)),
          ...(project.demo ? [{ name: 'demo.url', content: project.demo }] : []),
          ...project.repos.map((repo) => {
            const suffix = repo.label ? `-${slug(repo.label)}` : ''
            return { name: `repository${suffix}.url`, displayName: `${t('fs.repo')}${suffix}.url`, content: repo.url }
          }),
          ...images(project.images, canonical.projects[index]?.images ?? []),
        ]),
      ),
    ),
    dir('certificates', t('fs.certificates'), [
      markdown('education.md', educationMarkdown(resume.education, locale), `${t('fs.education')}.md`),
      ...resume.certificates.flatMap((certificate): Spec[] => [
        markdown(`${certificate.id}.md`, certificateMarkdown(certificate, locale)),
        {
          name: `${certificate.id}.png`,
          displayName: `${certificate.name}.png`,
          content: toUrl(
            certificate.image
              ? mediaSrc({ src: certificate.image, caption: certificate.name })
              : placeholderImage(certificate.name),
          ),
        },
      ]),
    ]),
    dir('photos', t('fs.photos'), images(resume.photos, canonical.photos)),
    {
      name: 'resume.pdf',
      displayName: t('fs.resume'),
      // The PDF when there is one; else the résumé as text (the Viewer draws it from the data).
      content: resume.meta.pdf ? toUrl(assetUrl(resume.meta.pdf)) : resumeText(resume, locale),
    },
    markdown('experiencia.md', experienceMarkdown(resume, locale), t('fs.experienceFile')),
    // The Trash, freedesktop style: what's deleted goes in files/, why and from where in info/.
    dir('.trash', t('fs.trash'), [dir('files', t('fs.trash'), []), dir('info', undefined, [])]),
  ])
}

export class ResumeFs implements FsDriver {
  readonly name = 'resumefs'
  private nodes = new Map<Ino, Node>()
  private listeners = new Set<() => void>()
  private readonly resumeFor: (locale: Locale) => Resume
  private locale: Locale

  /** `resumeFor` gives the résumé in a language; the first one is where the real names come from. */
  constructor(resumeFor: (locale: Locale) => Resume, locale: Locale) {
    this.resumeFor = resumeFor
    this.locale = locale
    this.build()
  }

  async init() {}

  root(): Ino {
    return '/'
  }

  stat(ino: Ino): Inode | undefined {
    return this.nodes.get(ino)?.inode
  }

  readdir(dir: Ino): ReadonlyMap<string, Ino> {
    return this.nodes.get(dir)?.children ?? new Map()
  }

  async read(ino: Ino): Promise<Content> {
    const node = this.nodes.get(ino)
    if (!node || node.inode.kind !== 'file') throw new VfsError(node ? 'EISDIR' : 'ENOENT', ino)
    return node.content ?? ''
  }

  /** Changes the language: display names and generated content change, inode numbers and paths don't. */
  setLocale(locale: Locale) {
    if (locale === this.locale) return
    this.locale = locale
    this.build()
    this.listeners.forEach((listener) => listener())
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private build() {
    const nodes = new Map<Ino, Node>()
    const add = (spec: Spec, path: string) => {
      const kind: InodeKind = spec.children ? 'dir' : 'file'
      const content = spec.content
      const inode: Inode = {
        ino: path,
        kind,
        mime: spec.mime ?? mimeOf(spec.name, kind),
        ctime: MOUNTED,
        mtime: MOUNTED,
        mode: 'ro',
        displayName: spec.displayName,
        size: typeof content === 'string' ? new Blob([content]).size : undefined,
      }
      const node: Node = { inode, content }
      if (spec.children) {
        node.children = new Map(spec.children.map((child) => [child.name, joinPath(path, child.name)]))
        for (const child of spec.children) add(child, joinPath(path, child.name))
      }
      nodes.set(path, node)
    }
    add(resumeTree(this.resumeFor(this.locale), this.resumeFor('pt'), this.locale), '/')
    this.nodes = nodes
  }
}
