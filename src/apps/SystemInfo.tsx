import { version as reactVersion } from 'react'
import { Logo } from '../components/Logo.tsx'
import { useResume } from '../data/resume.ts'
import { useT } from '../i18n/index.ts'
import { useOS } from '../system/os.ts'
import { useSettings } from '../system/settings.ts'

const PALETTE = ['#e5484d', '#f0703a', '#ffb14a', '#1fa86a', '#15a6f0', '#5a55e0', '#8548d6', '#6a7482']

/** A neofetch-style card: the system's specs are the site's own stack and the owner's skills. */
export default function SystemInfo() {
  const t = useT()
  const { shell } = useOS()
  const theme = useSettings((s) => s.theme)
  const { basics, skills } = useResume()
  const user = basics.name.split(' ')[0].toLowerCase()

  const specs: [string, string][] = [
    ['OS', 'Everton OS 1.0 (web)'],
    [t('system.kernel'), `React ${reactVersion}`],
    [t('system.build'), 'Vite + TypeScript'],
    ['Shell', shell === 'desktop' ? t('system.shellDesktop') : t('system.shellMobile')],
    [t('system.windows'), shell === 'desktop' ? 'WinBox.js' : t('system.fullscreen')],
    [t('system.theme'), theme === 'dark' ? t('settings.dark') : t('settings.light')],
    [t('system.resolution'), `${window.innerWidth}×${window.innerHeight}`],
  ]

  return (
    <div className="app system">
      <div className="system-logo">
        <Logo size={120} />
      </div>
      <div className="system-info">
        <p className="system-host">
          <strong>{user}</strong>@<strong>everton-os</strong>
        </p>
        <dl>
          {specs.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <p className="system-host">{t('content.skills')}</p>
        <dl>
          {skills.map((group) => (
            <div key={group.name}>
              <dt>{group.name}</dt>
              <dd>{group.keywords.join(', ')}</dd>
            </div>
          ))}
        </dl>

        <div className="system-palette" aria-hidden>
          {PALETTE.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </div>
      </div>
    </div>
  )
}
