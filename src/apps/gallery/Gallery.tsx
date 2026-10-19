import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { track } from '../../analytics.ts'
import {
  type AppProps,
  type OS,
  useFileContent,
  useLaunchArgs,
  useObjectUrl,
  useOS,
  useT,
} from '../../sdk/index.ts'

interface Photo {
  /** Built from real names, so it reads the same in every language. */
  key: string
  path: string
  caption: string
  /** The folder it came from, shown as its album. */
  album: string
}

/** Every image in the file system, outside the Trash and hidden folders; links aren't followed. */
function collect(fs: OS['fs'], path: string, album: string): Photo[] {
  return fs.readdir(path).flatMap((entry) => {
    if (entry.inode.kind === 'dir') return collect(fs, entry.path, entry.displayName)
    if (entry.inode.kind !== 'file' || !entry.mime.startsWith('image/')) return []
    return [{ key: entry.path, path: entry.path, caption: entry.displayName.replace(/\.\w+$/, ''), album }]
  })
}

function PhotoImage({ path, alt, lazy = false }: { path: string; alt: string; lazy?: boolean }) {
  const { content } = useFileContent(path)
  const src = useObjectUrl(content)
  return src ? <img src={src} alt={alt} loading={lazy ? 'lazy' : undefined} /> : <span className="gallery-blank" />
}

/** Opened with an image (Open with › Gallery), it shows that one. */
export default function Gallery({ args }: AppProps) {
  const t = useT()
  const os = useOS()
  os.fs.useWatch()
  const photos = collect(os.fs, '/', os.fs.displayName('/'))
  const indexOf = (path?: string) => {
    const index = path ? photos.findIndex((photo) => photo.path === os.fs.lookup(path)?.path) : -1
    return index === -1 ? null : index
  }
  const [open, setOpen] = useState<number | null>(() => indexOf(args.files?.[0]))

  useLaunchArgs((next) => {
    const index = indexOf(next.files?.[0])
    if (index !== null) setOpen(index)
  })

  useEffect(() => {
    if (open === null) return
    const step = (delta: number) => {
      track('gallery_photo_navigated', { direction: delta < 0 ? 'previous' : 'next', method: 'keyboard' })
      setOpen((index) => (index === null ? null : (index + delta + photos.length) % photos.length))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, photos.length])

  if (photos.length === 0) return <div className="app app-empty">{t('gallery.empty')}</div>

  const current = open === null ? null : photos[open]
  const step = (delta: number) => {
    track('gallery_photo_navigated', { direction: delta < 0 ? 'previous' : 'next', method: 'button' })
    setOpen(((open ?? 0) + delta + photos.length) % photos.length)
  }

  return (
    <div className="app gallery">
      <ul className="gallery-grid">
        {photos.map((photo, index) => (
          <li key={photo.key}>
            <button
              onClick={() => {
                track('gallery_photo_opened', { photo: photo.key, album: photo.key.split('/').at(-2) || 'home' })
                setOpen(index)
              }}
            >
              <PhotoImage path={photo.path} alt={photo.caption} lazy />
              <span>
                {photo.caption}
                <small>{photo.album}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <div className="lightbox" role="dialog" aria-label={current.caption} onClick={() => setOpen(null)}>
          <button className="lightbox-close" aria-label={t('common.close')}>
            <X size={20} />
          </button>
          <button
            className="lightbox-step is-previous"
            aria-label={t('gallery.previous')}
            onClick={(event) => {
              event.stopPropagation()
              step(-1)
            }}
          >
            <ChevronLeft size={26} />
          </button>
          <figure onClick={(event) => event.stopPropagation()}>
            <PhotoImage path={current.path} alt={current.caption} />
            <figcaption>
              {current.caption} · {current.album}
            </figcaption>
          </figure>
          <button
            className="lightbox-step is-next"
            aria-label={t('gallery.next')}
            onClick={(event) => {
              event.stopPropagation()
              step(1)
            }}
          >
            <ChevronRight size={26} />
          </button>
        </div>
      )}
    </div>
  )
}
