import { Check, CodeXml, Moon, Sun } from 'lucide-react'
import { track } from '../../analytics.ts'
import { Logo } from '../../components/Logo.tsx'
import { locales } from '../../data/localize.ts'
import {
  type Theme,
  classicUrl,
  setLocale,
  setTheme,
  setWallpaper,
  useLocale,
  useResume,
  useSettings,
  useT,
  wallpapers,
} from '../../sdk/index.ts'

const THEMES: Theme[] = ['light', 'dark']
const THEME_ICONS = { light: Sun, dark: Moon }
const LANGUAGES = { pt: 'Português', en: 'English' }

export default function SettingsApp() {
  const t = useT()
  const locale = useLocale()
  const theme = useSettings((s) => s.theme)
  const wallpaper = useSettings((s) => s.wallpaper)
  // What this site is comes from its own entry in the résumé's projects.
  const project = useResume().projects.find((item) => item.id === 'everton-os')
  const repo = project?.repos[0]

  return (
    <div className="app settings">
      <section>
        <h2>{t('settings.theme')}</h2>
        <div className="segmented">
          {THEMES.map((value) => {
            const Icon = THEME_ICONS[value]
            return (
              <button
                key={value}
                className={theme === value ? 'is-active' : ''}
                aria-pressed={theme === value}
                onClick={() => setTheme(value, 'settings')}
              >
                <Icon size={16} aria-hidden />
                {t(value === 'light' ? 'settings.light' : 'settings.dark')}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2>{t('settings.wallpaper')}</h2>
        <div className="wallpaper-grid">
          {wallpapers.map((item) => (
            <button
              key={item.id}
              className={wallpaper === item.id ? 'is-active' : ''}
              aria-pressed={wallpaper === item.id}
              aria-label={item.name}
              title={item.name}
              style={{ backgroundImage: item.css }}
              onClick={() => setWallpaper(item.id, 'settings')}
            >
              {wallpaper === item.id && <Check size={18} />}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t('settings.language')}</h2>
        <div className="segmented">
          {locales.map((value) => (
            <button
              key={value}
              className={locale === value ? 'is-active' : ''}
              aria-pressed={locale === value}
              onClick={() => setLocale(value, 'settings')}
            >
              {LANGUAGES[value]}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-about">
        <h2>{t('settings.about')}</h2>
        <p className="settings-about-name">
          <Logo size={32} />
          <span>
            <strong>Everton OS</strong>
            <span className="settings-note">{t('settings.version')} 1.0</span>
          </span>
        </p>
        {project && (
          <>
            <p>{project.description}</p>
            <ul>
              {project.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>{t('settings.stack')}</h3>
            <ul className="settings-tags">
              {project.keywords.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}
        <p className="settings-links">
          {repo && (
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('source_code_opened', { source: 'settings' })}
            >
              <CodeXml size={16} />
              {t('settings.github')}
            </a>
          )}
          <a href={classicUrl(locale)} onClick={() => track('classic_version_opened', { source: 'settings' })}>
            {t('common.classic')}
          </a>
        </p>
      </section>
    </div>
  )
}
