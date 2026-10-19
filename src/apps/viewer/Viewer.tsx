import { Download, Printer } from 'lucide-react'
import { useEffect } from 'react'
import { track, useTrackView } from '../../analytics.ts'
import { Markdown } from '../../components/Markdown.tsx'
import { ResumeDocument } from '../../components/ResumeDocument.tsx'
import {
  type AppProps,
  type Content,
  type Entry,
  RESUME_PATH,
  classicUrl,
  legacyFileType,
  useAppWindow,
  useFileContent,
  useLocale,
  useObjectUrl,
  useOS,
  useT,
} from '../../sdk/index.ts'

/** Opens the files of the virtual file system: the résumé, Markdown and images. */
export default function Viewer({ args }: AppProps) {
  const t = useT()
  const os = useOS()
  const appWindow = useAppWindow()
  os.fs.useWatch()
  const entry = os.fs.lookup(args.files?.[0] ?? RESUME_PATH)
  const file = entry?.inode.kind === 'file' ? entry : null
  const { content, error } = useFileContent(file?.path ?? null)
  const title = file?.displayName

  useEffect(() => {
    if (title) appWindow.setTitle(title)
  }, [appWindow, title])

  if (!file || error) return <div className="app app-empty">{t('viewer.notFound')}</div>

  return (
    <div className="app viewer">
      <div className="toolbar">
        <span className="toolbar-title">{file.displayName}</span>
        {content !== undefined && <DownloadButton file={file} content={content} />}
      </div>
      {content === undefined ? <div className="app-loading" /> : <FileContent file={file} content={content} />}
    </div>
  )
}

function FileContent({ file, content }: { file: Entry; content: Content }) {
  const { shell } = useOS()

  if (file.mime.startsWith('image/')) return <ImageContent name={file.displayName} content={content} />
  if (file.path === RESUME_PATH) {
    // Phone browsers don't render PDFs inline, so there the page is always drawn from the data.
    const pdf = content instanceof URL && shell === 'desktop' ? content.href : null
    return <ResumeContent name={file.displayName} pdf={pdf} />
  }
  if (typeof content !== 'string') return <ImageContent name={file.displayName} content={content} />
  return (
    <div className="viewer-page">
      <div className="paper">
        {file.mime === 'text/markdown' ? <Markdown source={content} /> : <pre className="viewer-text">{content}</pre>}
      </div>
    </div>
  )
}

function ImageContent({ name, content }: { name: string; content: Content }) {
  const src = useObjectUrl(content)
  return <div className="viewer-image">{src && <img src={src} alt={name} />}</div>
}

function ResumeContent({ name, pdf }: { name: string; pdf: string | null }) {
  useTrackView('resume_viewed', { format: pdf ? 'pdf' : 'page' })

  if (pdf) return <iframe className="viewer-pdf" src={pdf} title={name} />
  return (
    <div className="viewer-page">
      <ResumeDocument />
    </div>
  )
}

function DownloadButton({ file, content }: { file: Entry; content: Content }) {
  const t = useT()
  const locale = useLocale()
  const objectUrl = useObjectUrl(content)
  const fileType = legacyFileType(file.mime)

  if (file.path === RESUME_PATH && typeof content === 'string') {
    // No PDF file configured: the classic page is print-ready and saves as PDF.
    return (
      <a
        className="button"
        href={`${classicUrl(locale)}?print`}
        target="_blank"
        rel="noopener"
        onClick={() => track('file_downloaded', { file: file.name, file_type: fileType, export_method: 'print' })}
      >
        <Printer size={15} />
        {t('viewer.savePdf')}
      </a>
    )
  }

  const href =
    typeof content === 'string' ? `data:${file.mime};charset=utf-8,${encodeURIComponent(content)}` : objectUrl

  return (
    <a
      className="button"
      href={href}
      download={file.displayName}
      onClick={() => track('file_downloaded', { file: file.name, file_type: fileType, export_method: 'download' })}
    >
      <Download size={15} />
      {t('common.download')}
    </a>
  )
}
