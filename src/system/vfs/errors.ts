// File system errors, with POSIX codes. Each maps to one of the `fs.error.*`
// messages of i18n/dict.ts.

export type VfsErrorCode =
  | 'EEXIST'
  | 'EROFS'
  | 'EPERM'
  | 'ENOENT'
  | 'ENOTDIR'
  | 'EISDIR'
  | 'EINVAL'
  | 'ENOSPC'
  | 'EFBIG'
  | 'ELOOP'

/** The `fs.error.*` message an error is shown with. */
export type VfsErrorMessage =
  | 'exists'
  | 'readOnly'
  | 'notFound'
  | 'notDir'
  | 'isDir'
  | 'invalidName'
  | 'intoItself'
  | 'quota'
  | 'tooLarge'
  | 'loop'
  | 'noApp'

const messages: Record<VfsErrorCode, VfsErrorMessage> = {
  EEXIST: 'exists',
  EROFS: 'readOnly',
  EPERM: 'readOnly',
  ENOENT: 'notFound',
  ENOTDIR: 'notDir',
  EISDIR: 'isDir',
  EINVAL: 'invalidName',
  ENOSPC: 'quota',
  EFBIG: 'tooLarge',
  ELOOP: 'loop',
}

/** Why a file operation was refused. `target` is the name or path the message is about. */
export class VfsError extends Error {
  code: VfsErrorCode
  target: string
  /** Which message it's shown with; set when the code alone doesn't say (EINVAL for moving a folder into itself). */
  reason: VfsErrorMessage

  constructor(code: VfsErrorCode, target: string, reason?: VfsErrorMessage) {
    super(`${code}: ${target}`)
    this.code = code
    this.target = target
    this.reason = reason ?? messages[code]
  }
}

export const isQuotaError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'QuotaExceededError'
    : (error as { name?: string } | null)?.name === 'QuotaExceededError'
