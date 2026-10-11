import { Download, Printer } from 'lucide-react'
import { useEffect } from 'react'
import { Markdown } from '../components/Markdown.tsx'
import { ResumeDocument } from '../components/ResumeDocument.tsx'
import { useResume } from '../data/resume.ts'
import { useLocale, useT } from '../i18n/index.ts'
import type { AppProps } from '../system/apps.ts'
import { type FsFile, RESUME_PATH, useFs, walk } from '../system/fs.ts'
import { assetUrl, classicUrl } from '../system/media.ts'
import { useAppWindow, useOS } from '../system/os.ts'

/** Opens the files of the virtual file system: the résumé, Markdown and images. */
export default function Viewer({ args }: AppProps) {
  const t = useT()
  const fs = useFs()
  const appWindow = useAppWindow()
  const node = walk(fs, args?.path ?? RESUME_PATH)?.at(-1)
  const file = node?.kind === 'file' ? node : null

  useEffect(() => {
    if (file) appWindow.setTitle(file.name)
  }, [appWindow, file])

  if (!file) return <div className="app app-empty">{t('viewer.notFound')}</div>

  return (
    <div className="app viewer">
      <div className="toolbar">
        <span className="toolbar-title">{file.name}</span>
        <DownloadButton file={file} />
      </div>
      <FileContent file={file} />
    </div>
  )
}

function FileContent({ file }: { file: FsFile }) {
  const { shell } = useOS()
  const { meta } = useResume()

  if (file.type === 'image') {
    return (
      <div className="viewer-image">
        <img src={file.src} alt={file.name} />
      </div>
    )
  }
  if (file.type === 'resume') {
    // Phone browsers don't render PDFs inline, so there the page is always drawn from the data.
    if (meta.pdf && shell === 'desktop') {
      return <iframe className="viewer-pdf" src={assetUrl(meta.pdf)} title={file.name} />
    }
    return (
      <div className="viewer-page">
        <ResumeDocument />
      </div>
    )
  }
  return (
    <div className="viewer-page">
      <div className="paper">
        <Markdown source={file.content ?? ''} />
      </div>
    </div>
  )
}

function DownloadButton({ file }: { file: FsFile }) {
  const t = useT()
  const locale = useLocale()
  const { meta } = useResume()

  if (file.type === 'resume' && !meta.pdf) {
    // No PDF file configured: the classic page is print-ready and saves as PDF.
    return (
      <a className="button" href={`${classicUrl(locale)}?print`} target="_blank" rel="noopener">
        <Printer size={15} />
        {t('viewer.savePdf')}
      </a>
    )
  }

  const href =
    file.type === 'resume'
      ? assetUrl(meta.pdf!)
      : file.type === 'image'
        ? file.src
        : `data:text/markdown;charset=utf-8,${encodeURIComponent(file.content ?? '')}`

  return (
    <a className="button" href={href} download={file.name}>
      <Download size={15} />
      {t('common.download')}
    </a>
  )
}
