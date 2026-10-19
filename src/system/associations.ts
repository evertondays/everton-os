import type { Shell } from '../sdk/app.ts'
import { type AppDef, runnableIn } from './apps.ts'
import { mimeMatches, mimeSpecificity } from './vfs/mime.ts'

// Which app opens what, from the `handles` of each manifest: the most
// specific type wins (`text/markdown` over `text/*` over `*\/*`), then the
// app's order.

/** How well `app` handles `mime`: -1 when it doesn't. */
function score(app: AppDef, mime: string): number {
  const patterns = app.handles?.mime?.filter((pattern) => mimeMatches(pattern, mime)) ?? []
  return patterns.length === 0 ? -1 : Math.max(...patterns.map(mimeSpecificity))
}

/** Every app of `shell` that opens `mime`, the default first. */
export function appsForMime(mime: string, shell: Shell): AppDef[] {
  return runnableIn(shell)
    .map((app) => ({ app, score: score(app, mime) }))
    .filter(({ score }) => score >= 0)
    .toSorted((a, b) => b.score - a.score)
    .map(({ app }) => app)
}

export const defaultAppFor = (mime: string, shell: Shell): AppDef | undefined => appsForMime(mime, shell)[0]

/** The app that opens addresses of `scheme` (`https`), if any. */
export const appForScheme = (scheme: string, shell: Shell): AppDef | undefined =>
  runnableIn(shell).find((app) => app.handles?.schemes?.includes(scheme.toLowerCase()))
