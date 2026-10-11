import { useState } from 'react'
import { AppIcon } from '../../components/AppIcon.tsx'
import { useT } from '../../i18n/index.ts'
import { type AppDef, apps, resumeShortcut } from '../../system/apps.ts'
import { PROJECTS_PATH, RESUME_PATH } from '../../system/fs.ts'
import { useOS } from '../../system/os.ts'

interface DesktopIcon {
  id: string
  label: string
  icon: Pick<AppDef, 'icon' | 'tint'>
  open(): void
}

export function DesktopIcons() {
  const t = useT()
  const os = useOS()
  const [selected, setSelected] = useState<string | null>(null)

  const icons: DesktopIcon[] = [
    {
      id: 'resume',
      label: t('fs.resume'),
      icon: resumeShortcut,
      open: () => os.open('viewer', { path: RESUME_PATH }),
    },
    {
      id: 'projects',
      label: t('fs.projects'),
      icon: apps.files,
      open: () => os.open('files', { path: PROJECTS_PATH }),
    },
    { id: 'contact', label: t('app.contact'), icon: apps.contact, open: () => os.open('contact') },
    { id: 'terminal', label: t('app.terminal'), icon: apps.terminal, open: () => os.open('terminal') },
    { id: 'trash', label: t('app.trash'), icon: apps.trash, open: () => os.open('trash') },
  ]

  return (
    <div
      className="desktop-icons"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSelected(null)
      }}
    >
      {icons.map((icon) => (
        <button
          key={icon.id}
          className={`desktop-icon${selected === icon.id ? ' is-selected' : ''}`}
          onClick={() => setSelected(icon.id)}
          onDoubleClick={icon.open}
          onKeyDown={(event) => {
            if (event.key === 'Enter') icon.open()
          }}
          onBlur={() => setSelected(null)}
        >
          <AppIcon app={icon.icon} size={52} />
          <span>{icon.label}</span>
        </button>
      ))}
    </div>
  )
}
