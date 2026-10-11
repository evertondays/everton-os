import { Avatar } from '../../components/Avatar.tsx'
import { useResume } from '../../data/resume.ts'
import { useLocale, useT } from '../../i18n/index.ts'
import { formatDate, formatTime } from '../../system/format.ts'
import { classicUrl } from '../../system/media.ts'
import { useClock } from '../../system/useClock.ts'
import { useWallpaper } from '../../system/wallpapers.ts'

/** The login screen: one click (or Enter) gets in, there is no password. */
export function Login({ onEnter }: { onEnter(): void }) {
  const t = useT()
  const locale = useLocale()
  const now = useClock()
  const wallpaper = useWallpaper()
  const { basics } = useResume()

  return (
    <div className="login" style={{ backgroundImage: wallpaper.css }}>
      <div className="login-shade">
        <time className="login-clock" dateTime={now.toISOString()}>
          <span>{formatTime(now, locale)}</span>
          <span>{formatDate(now, locale)}</span>
        </time>

        <button className="login-user" autoFocus onClick={onEnter}>
          <Avatar size={112} />
          <span className="login-name">{basics.name}</span>
          <span className="login-label">{basics.label}</span>
          <span className="login-enter">{t('login.enter')}</span>
        </button>

        <a className="login-classic" href={classicUrl(locale)}>
          {t('login.classic')}
        </a>
      </div>
    </div>
  )
}
