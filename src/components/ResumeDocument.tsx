import { track } from '../analytics.ts'
import { formatMonth, formatPeriod, useLocale, useResume, useT } from '../sdk/index.ts'

/** The whole résumé laid out as a printed page, straight from the data. */
export function ResumeDocument() {
  const resume = useResume()
  const locale = useLocale()
  const t = useT()
  const { basics } = resume

  return (
    <article className="paper">
      <header className="paper-header">
        <h1>{basics.name}</h1>
        <p className="paper-label">{basics.label}</p>
        <p className="paper-contacts">
          <span>
            {basics.location.city}, {basics.location.region}
          </span>
          <a href={`mailto:${basics.email}`} onClick={() => track('contact_email_clicked', { source: 'resume' })}>
            {basics.email}
          </a>
          {basics.profiles.map((profile) => (
            <a
              key={profile.network}
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('contact_profile_clicked', { network: profile.network.toLowerCase(), source: 'resume' })}
            >
              {profile.network}: {profile.username}
            </a>
          ))}
        </p>
      </header>

      <section>
        <h2>{t('content.summary')}</h2>
        <p>{basics.summary}</p>
      </section>

      <section>
        <h2>{t('content.experience')}</h2>
        {resume.work.map((work) => (
          <div className="paper-entry" key={work.id}>
            <h3>
              {work.position} · {work.name}
            </h3>
            <p className="paper-meta">
              {[formatPeriod(work.startDate, work.endDate, locale), work.location].filter(Boolean).join(' · ')}
            </p>
            {work.summary && <p>{work.summary}</p>}
            <ul>
              {work.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>{t('content.projects')}</h2>
        {resume.projects.map((project) => (
          <div className="paper-entry" key={project.id}>
            <h3>{project.name}</h3>
            <p>{project.description}</p>
            <p className="paper-meta">{project.keywords.join(' · ')}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>{t('content.education')}</h2>
        {resume.education.map((education) => (
          <div className="paper-entry" key={education.id}>
            <h3>
              {education.studyType} · {education.area}
            </h3>
            <p className="paper-meta">
              {education.institution} · {formatPeriod(education.startDate, education.endDate, locale)}
            </p>
            {education.summary && <p>{education.summary}</p>}
          </div>
        ))}
        {resume.certificates.map((certificate) => (
          <div className="paper-entry" key={certificate.id}>
            <h3>{certificate.name}</h3>
            <p className="paper-meta">
              {certificate.issuer} · {formatMonth(certificate.date, locale)}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>{t('content.skills')}</h2>
        <dl className="paper-skills">
          {resume.skills.map((group) => (
            <div key={group.name}>
              <dt>{group.name}</dt>
              <dd>{group.keywords.join(', ')}</dd>
            </div>
          ))}
          <div>
            <dt>{t('content.languages')}</dt>
            <dd>{resume.languages.map((item) => `${item.language} (${item.fluency})`).join(', ')}</dd>
          </div>
        </dl>
      </section>
    </article>
  )
}
