import type { InodeKind } from './types.ts'

// What a file is, from its name. Apps say which types they open (their
// manifest's `handles`), and associations.ts picks one.

export const DIRECTORY_MIME = 'inode/directory'
export const SYMLINK_MIME = 'inode/symlink'
export const LAUNCHER_MIME = 'application/x-launcher'
export const URL_MIME = 'application/x-url'
export const UNKNOWN_MIME = 'application/octet-stream'

const byExtension: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  url: URL_MIME,
  app: LAUNCHER_MIME,
}

export const extensionOf = (name: string) => /\.([^./]+)$/.exec(name)?.[1].toLowerCase() ?? ''

export function mimeOf(name: string, kind: InodeKind): string {
  if (kind === 'dir') return DIRECTORY_MIME
  if (kind === 'symlink') return SYMLINK_MIME
  return byExtension[extensionOf(name)] ?? UNKNOWN_MIME
}

/** Whether `pattern` (`text/markdown`, `text/*` or `*\/*`) covers `mime`. */
export function mimeMatches(pattern: string, mime: string): boolean {
  if (pattern === '*/*' || pattern === mime) return true
  return pattern.endsWith('/*') && mime.startsWith(pattern.slice(0, -1))
}

/** How specific a pattern is: an exact type beats `type/*`, which beats `*\/*`. */
export const mimeSpecificity = (pattern: string) => (pattern === '*/*' ? 0 : pattern.endsWith('/*') ? 1 : 2)
