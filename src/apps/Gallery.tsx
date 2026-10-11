import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n/index.ts'
import { type FsDir, useFs, visibleChildren } from '../system/fs.ts'

interface Photo {
  key: string
  src: string
  caption: string
  /** The folder it came from, shown as its album. */
  album: string
}

/** Every image in the file system, outside the Trash. */
function collect(dir: FsDir, album: string, prefix = ''): Photo[] {
  return visibleChildren(dir).flatMap((node) => {
    const key = `${prefix}/${node.id}`
    if (node.kind === 'dir') return collect(node, node.name, key)
    if (node.type !== 'image' || !node.src) return []
    return [{ key, src: node.src, caption: node.name.replace(/\.\w+$/, ''), album }]
  })
}

export default function Gallery() {
  const t = useT()
  const fs = useFs()
  const photos = useMemo(() => collect(fs, fs.name), [fs])
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    if (open === null) return
    const step = (delta: number) => setOpen((index) => (index === null ? null : (index + delta + photos.length) % photos.length))
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
  const step = (delta: number) => setOpen(((open ?? 0) + delta + photos.length) % photos.length)

  return (
    <div className="app gallery">
      <ul className="gallery-grid">
        {photos.map((photo, index) => (
          <li key={photo.key}>
            <button onClick={() => setOpen(index)}>
              <img src={photo.src} alt={photo.caption} loading="lazy" />
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
            <img src={current.src} alt={current.caption} />
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
