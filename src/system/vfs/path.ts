// Path helpers. Paths are absolute and made of real names: `/projects/everton-os/README.md`.

export const ROOT = '/'

export function joinPath(parent: string, name: string): string {
  return `${parent === '/' ? '' : parent}/${name}`
}

/** The folder part and the last segment of a path, as typed: `a/b/c.txt` → [`a/b`, `c.txt`]. */
export function splitPath(path: string): [string, string] {
  const trimmed = path.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  if (slash === -1) return ['.', trimmed]
  return [trimmed.slice(0, slash) || '/', trimmed.slice(slash + 1)]
}

export const basename = (path: string) => splitPath(path)[1]

export const dirname = (path: string) => (path === '/' ? '/' : splitPath(path)[0])

/** Whether `path` is `folder` or somewhere inside it. */
export const isInside = (path: string, folder: string) =>
  path === folder || path.startsWith(folder === '/' ? '/' : `${folder}/`)

export const segments = (path: string) => path.split('/').filter(Boolean)
