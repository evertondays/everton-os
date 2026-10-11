import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { type Locale, localize } from '../src/data/localize.ts'
import type { Resume } from '../src/data/types.ts'
import { renderClassic } from './render.ts'

const PAGES: Record<string, Locale> = {
  'classic/index.html': 'pt',
  'classic/en/index.html': 'en',
}

/**
 * Generates the classic version of the résumé from src/data/curriculo.json:
 * emitted as static files on build, rendered on request by the dev server.
 */
export function classicPages(): Plugin {
  let root = process.cwd()

  const render = (locale: Locale) => {
    // Read on every call so the dev server always shows the current data.
    const raw: unknown = JSON.parse(readFileSync(join(root, 'src/data/curriculo.json'), 'utf8'))
    return renderClassic(localize(raw, locale) as Resume, locale)
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
        if (!locale) {
          next()
          return
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(render(locale))
      })
    },
    generateBundle() {
      for (const [fileName, locale] of Object.entries(PAGES)) {
        this.emitFile({ type: 'asset', fileName, source: render(locale) })
      }
    },
  }
}
