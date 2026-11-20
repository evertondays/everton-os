import type { Locale } from '../src/data/localize.ts'
import type { Resume } from '../src/data/types.ts'

// What search engines read besides the text of the pages: who the site is
// about (JSON-LD), which pages there are (sitemap.xml) and where to find that
// list (robots.txt). Every address comes from `basics.url` in curriculo.json.

/** The classic pages, by language, relative to the site's address. */
export const CLASSIC_PATHS: Record<Locale, string> = { pt: 'classic/', en: 'classic/en/' }

export const absolute = (site: string, path: string) => new URL(path, site).href

/** How a language is written in hreflang and og:locale. */
export const HREFLANG: Record<Locale, string> = { pt: 'pt-BR', en: 'en' }
export const OG_LOCALE: Record<Locale, string> = { pt: 'pt_BR', en: 'en_US' }

/**
 * A schema.org Person for a `<script type="application/ld+json">`: what lets
 * a search show the name with the role, the photo and the profiles.
 */
export function personJsonLd(resume: Resume, site: string): string {
  const { basics } = resume
  const current = resume.work.find((item) => item.endDate === null)
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: basics.name,
    jobTitle: basics.label,
    description: basics.intro ?? basics.summary,
    url: site,
    ...(basics.image && { image: absolute(site, basics.image) }),
    address: {
      '@type': 'PostalAddress',
      addressLocality: basics.location.city,
      addressRegion: basics.location.region,
      addressCountry: basics.location.countryCode,
    },
    sameAs: basics.profiles.map((profile) => profile.url),
    ...(current && { worksFor: { '@type': 'Organization', name: current.name } }),
    alumniOf: [...new Set(resume.education.map((item) => item.institution))].map((name) => ({
      '@type': 'EducationalOrganization',
      name,
    })),
    knowsAbout: resume.skills.flatMap((group) => group.keywords),
  }
  // Inside a <script>, "</" would end it early.
  return JSON.stringify(person).replaceAll('<', '\\u003c')
}

/** The pages to index: the OS at the root and the classic résumé in each language, which point at each other. */
export function sitemap(site: string, lastmod: string): string {
  const alternates = (Object.entries(CLASSIC_PATHS) as [Locale, string][])
    .map(([locale, path]) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[locale]}" href="${absolute(site, path)}"/>`)
    .join('')
  const url = (path: string, withAlternates: boolean) =>
    `<url><loc>${absolute(site, path)}</loc><lastmod>${lastmod}</lastmod>${withAlternates ? alternates : ''}</url>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[url('', false), ...Object.values(CLASSIC_PATHS).map((path) => url(path, true))].join('\n')}
</urlset>
`
}

export function robots(site: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${absolute(site, 'sitemap.xml')}
`
}
