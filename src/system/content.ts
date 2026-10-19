import type { Locale } from '../data/localize.ts'
import type { Certificate, Education, Project, Repo, Resume, Work } from '../data/types.ts'
import { translate } from '../i18n/dict.ts'
import { formatMonth, formatPeriod } from './format.ts'

// Markdown for the files of the virtual file system, generated from the resume data.

const bullets = (items: string[]) => items.map((item) => `- ${item}`).join('\n')

const join = (...blocks: (string | false | undefined)[]) => blocks.filter(Boolean).join('\n\n')

export function workMarkdown(work: Work, locale: Locale, level = 1): string {
  const meta = [formatPeriod(work.startDate, work.endDate, locale), work.location].filter(Boolean).join(' · ')
  return join(
    `${'#'.repeat(level)} ${work.position} — ${work.name}`,
    `*${meta}*`,
    work.summary,
    bullets(work.highlights),
    !!work.keywords?.length && `**${translate(locale, 'content.tech')}:** ${work.keywords.join(', ')}`,
  )
}

export function experienceMarkdown(resume: Resume, locale: Locale): string {
  return join(
    `# ${translate(locale, 'content.experience')}`,
    ...resume.work.map((work) => workMarkdown(work, locale, 2)),
  )
}

/** A repository link's text: "Repositório", or "Repositório (backend)" when the project has several. */
export function repoText(repo: Repo, locale: Locale): string {
  const text = translate(locale, 'content.repo')
  return repo.label ? `${text} (${repo.label})` : text
}

export function projectMarkdown(project: Project, locale: Locale): string {
  const links = [
    project.demo && `[${translate(locale, 'content.demo')}](${project.demo})`,
    ...project.repos.map((repo) => `[${repoText(repo, locale)}](${repo.url})`),
  ].filter(Boolean)
  return join(
    `# ${project.name}`,
    project.description,
    bullets(project.highlights),
    project.keywords.length > 0 && `**${translate(locale, 'content.tech')}:** ${project.keywords.join(', ')}`,
    links.join(' · '),
  )
}

export function educationMarkdown(education: Education[], locale: Locale): string {
  return join(
    `# ${translate(locale, 'content.education')}`,
    ...education.map((item) =>
      join(
        `## ${item.studyType} — ${item.area}`,
        `*${item.institution} · ${formatPeriod(item.startDate, item.endDate, locale)}*`,
        item.summary,
      ),
    ),
  )
}

export function certificateMarkdown(certificate: Certificate, locale: Locale): string {
  return join(
    `# ${certificate.name}`,
    `*${certificate.issuer} · ${formatMonth(certificate.date, locale)}*`,
    certificate.url && `[${translate(locale, 'content.verify')}](${certificate.url})`,
  )
}

/** Plain-text résumé, used by `cat` on the résumé file in the Terminal. */
export function resumeText(resume: Resume, locale: Locale): string {
  const { basics } = resume
  return join(
    `# ${basics.name} — ${basics.label}`,
    basics.summary,
    experienceMarkdown(resume, locale).replace(/^# /, '## '),
    `## ${translate(locale, 'content.skills')}`,
    bullets(resume.skills.map((group) => `${group.name}: ${group.keywords.join(', ')}`)),
  )
}
