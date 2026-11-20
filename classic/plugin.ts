import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HtmlTagDescriptor, Plugin } from 'vite'
import { type Locale, localize } from '../src/data/localize.ts'
import type { Resume } from '../src/data/types.ts'
import { renderClassic } from './render.ts'
import { absolute, personJsonLd, robots, sitemap } from './seo.ts'

const PAGES: Record<string, Locale> = {
  'classic/index.html': 'pt',
  'classic/en/index.html': 'en',
}

/**
 * Generates the classic version of the résumé from src/data/curriculo.json:
 * emitted as static files on build, rendered on request by the dev server.
 * Also what search engines need: sitemap.xml, robots.txt, and the canonical
 * address, preview image and JSON-LD of the OS's own page.
 */
export function classicPages(): Plugin {
  let root = process.cwd()

  // Read on every call so the dev server always shows the current data.
  const resume = (locale: Locale) =>
    localize(JSON.parse(readFileSync(join(root, 'src/data/curriculo.json'), 'utf8')), locale) as Resume

  const files = (): Record<string, string> => {
    const site = resume('pt').basics.url
    return site
      ? { 'sitemap.xml': sitemap(site, new Date().toISOString().slice(0, 10)), 'robots.txt': robots(site) }
      : {}
  }

  return {
    name: 'everton-os:classic',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0].replace(/^\//, '')
        const locale = PAGES[path.endsWith('/') ? `${path}index.html` : path]
        if (locale) {
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(renderClassic(resume(locale), locale))
          return
        }
        const file = files()[path]
        if (file !== undefined) {
          response.setHeader('Content-Type', path.endsWith('.xml') ? 'application/xml' : 'text/plain; charset=utf-8')
          response.end(file)
          return
        }
        next()
      })
    },
    // The OS's page: its text is static in index.html; what needs the site's address comes from the résumé.
    transformIndexHtml() {
      const { basics } = resume('pt')
      const site = basics.url
      if (!site) return []
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'canonical', href: site } },
        { tag: 'meta', attrs: { property: 'og:url', content: site } },
        ...(basics.image ? [{ tag: 'meta', attrs: { property: 'og:image', content: absolute(site, basics.image) } }] : []),
        { tag: 'script', attrs: { type: 'application/ld+json' }, children: personJsonLd(resume('pt'), site) },
      ]
      // At the end of <head>: <meta charset> has to stay within its first 1024 bytes.
      return tags.map((tag) => ({ ...tag, injectTo: 'head' }))
    },
    generateBundle() {
      for (const [fileName, locale] of Object.entries(PAGES)) {
        this.emitFile({ type: 'asset', fileName, source: renderClassic(resume(locale), locale) })
      }
      for (const [fileName, source] of Object.entries(files())) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}
