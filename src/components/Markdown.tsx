import { marked } from 'marked'
import { type MouseEvent, useMemo } from 'react'
import { track } from '../analytics.ts'

/** Renders Markdown from our own content files. Links open in a real browser tab. */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => marked.parse(source, { async: false }), [source])

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    event.preventDefault()
    track('external_link_clicked', { url: anchor.href, source: 'markdown' })
    window.open(anchor.href, '_blank', 'noopener')
  }

  return <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
