import { ExternalLink, FileUser, Folder, Mail, MapPin } from 'lucide-react'
import { track } from '../../analytics.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { PROJECTS_PATH, RESUME_PATH, classicUrl, useLocale, useOS, useResume, useT } from '../../sdk/index.ts'

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
      <p className="about-summary">{basics.intro ?? basics.summary}</p>

      <div className="about-actions">
        <button
          className="button is-primary"
          onClick={() => {
            track('portfolio_cta_selected', { destination: 'resume' })
            os.exec('viewer', { files: [RESUME_PATH] }, 'about')
          }}
        >
          <FileUser size={16} />
          {t('about.resume')}
        </button>
        <button
          className="button"
          onClick={() => {
            track('portfolio_cta_selected', { destination: 'projects' })
            os.exec('files', { files: [PROJECTS_PATH] }, 'about')
          }}
        >
          <Folder size={16} />
          {t('fs.projects')}
        </button>
        <button
          className="button"
          onClick={() => {
            track('portfolio_cta_selected', { destination: 'contact' })
            os.exec('contact', {}, 'about')
          }}
        >
          <Mail size={16} />
          {os.apps.get('contact')?.name}
        </button>
      </div>

      <ul className="about-links">
        {basics.profiles.map((profile) => (
          <li key={profile.network}>
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('contact_profile_clicked', { network: profile.network.toLowerCase(), source: 'about' })}
            >
              {profile.network}
              <ExternalLink size={13} />
            </a>
          </li>
        ))}
      </ul>

      <p className="about-classic">
        {t('about.hurry')}{' '}
        <a href={classicUrl(locale)} onClick={() => track('classic_version_opened', { source: 'about' })}>
          {t('common.classic')}
        </a>
      </p>
    </div>
  )
}
