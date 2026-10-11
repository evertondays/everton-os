import { ExternalLink, FileUser, Folder, Mail, MapPin } from 'lucide-react'
import { Avatar } from '../components/Avatar.tsx'
import { useResume } from '../data/resume.ts'
import { useLocale, useT } from '../i18n/index.ts'
import { PROJECTS_PATH, RESUME_PATH } from '../system/fs.ts'
import { classicUrl } from '../system/media.ts'
import { useOS } from '../system/os.ts'

export default function About() {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const { basics } = useResume()

  return (
    <div className="app about">
      <Avatar size={104} />
      <h1>{basics.name}</h1>
      <p className="about-label">{basics.label}</p>
      <p className="about-location">
        <MapPin size={14} />
        {basics.location.city}, {basics.location.region}
      </p>
      <p className="about-summary">{basics.summary}</p>

      <div className="about-actions">
        <button className="button is-primary" onClick={() => os.open('viewer', { path: RESUME_PATH })}>
          <FileUser size={16} />
          {t('about.resume')}
        </button>
        <button className="button" onClick={() => os.open('files', { path: PROJECTS_PATH })}>
          <Folder size={16} />
          {t('fs.projects')}
        </button>
        <button className="button" onClick={() => os.open('contact')}>
          <Mail size={16} />
          {t('app.contact')}
        </button>
      </div>

      <ul className="about-links">
        {basics.profiles.map((profile) => (
          <li key={profile.network}>
            <a href={profile.url} target="_blank" rel="noopener noreferrer">
              {profile.network}
              <ExternalLink size={13} />
            </a>
          </li>
        ))}
      </ul>

      <p className="about-classic">
        {t('about.hurry')} <a href={classicUrl(locale)}>{t('common.classic')}</a>
      </p>
    </div>
  )
}
