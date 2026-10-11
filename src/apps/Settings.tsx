import { Check } from 'lucide-react'
import { locales } from '../data/localize.ts'
import { useLocale, useT } from '../i18n/index.ts'
import { classicUrl } from '../system/media.ts'
import { type Theme, settings, useSettings } from '../system/settings.ts'
import { wallpapers } from '../system/wallpapers.ts'

const THEMES: Theme[] = ['light', 'dark']
const LANGUAGES = { pt: 'Português', en: 'English' }

export default function SettingsApp() {
  const t = useT()
  const locale = useLocale()
  const theme = useSettings((s) => s.theme)
  const wallpaper = useSettings((s) => s.wallpaper)

  return (
    <div className="app settings">
      <section>
        <h2>{t('settings.theme')}</h2>
        <div className="segmented">
          {THEMES.map((value) => (
            <button
              key={value}
              className={theme === value ? 'is-active' : ''}
              aria-pressed={theme === value}
              onClick={() => settings.set({ theme: value })}
            >
              {t(value === 'light' ? 'settings.light' : 'settings.dark')}
            </button>
          ))}
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
              onClick={() => settings.set({ wallpaper: item.id })}
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
              onClick={() => settings.set({ locale: value })}
            >
              {LANGUAGES[value]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t('settings.about')}</h2>
        <p className="settings-note">
          Everton OS 1.0 · <a href={classicUrl(locale)}>{t('common.classic')}</a>
        </p>
      </section>
    </div>
  )
}
