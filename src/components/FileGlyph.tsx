import { File, FileText, FileUser, Folder, Globe } from 'lucide-react'
import { type Entry, LAUNCHER_MIME, URL_MIME, tileFor, useFileContent, useObjectUrl } from '../sdk/index.ts'
import { AppIcon } from './AppIcon.tsx'

/**
 * How an entry looks in a file list (Files, the Open and Save dialogs):
 * a glyph, a thumbnail for images, and a tile for shortcuts and launchers.
 */
export function FileGlyph({ entry, size }: { entry: Entry; size: number }) {
  const { inode, mime } = entry
  if (inode.kind === 'symlink' || mime === LAUNCHER_MIME) {
    const tile = tileFor(entry)
    return <AppIcon app={tile} size={size - 6} link={tile.link} />
  }
  if (inode.kind === 'dir') return <Folder className="file-icon is-folder" size={size} strokeWidth={1.5} />
  if (mime.startsWith('image/')) return <Thumbnail path={entry.path} size={size} />
  if (mime === 'application/pdf') return <FileUser className="file-icon is-resume" size={size} strokeWidth={1.5} />
  if (mime === URL_MIME) return <Globe className="file-icon is-link" size={size} strokeWidth={1.5} />
  // The visitor's own text files are blue, like their desktop icon.
  if (mime.startsWith('text/') || inode.layer === 'upper') {
    return (
      <FileText className={`file-icon${inode.layer === 'upper' ? ' is-text' : ''}`} size={size} strokeWidth={1.5} />
    )
  }
  return <File className="file-icon" size={size} strokeWidth={1.5} />
}

function Thumbnail({ path, size }: { path: string; size: number }) {
  const { content } = useFileContent(path)
  const src = useObjectUrl(content)
  // Not an image after all (a text file renamed to .png, say).
  if (typeof content === 'string') return <File className="file-icon" size={size} strokeWidth={1.5} />
  return src ? (
    <img className="file-thumbnail" src={src} alt="" style={{ height: size }} />
  ) : (
    <span className="file-thumbnail" style={{ height: size, width: size }} />
  )
}
