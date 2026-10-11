import { Power, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AppIcon } from '../../components/AppIcon.tsx'
import { Avatar } from '../../components/Avatar.tsx'
import { useResume } from '../../data/resume.ts'
import { useLocale, useT } from '../../i18n/index.ts'
import { type AppDef, appList } from '../../system/apps.ts'
import { classicUrl } from '../../system/media.ts'
import { useOS } from '../../system/os.ts'

export function AppMenu({ onClose, onLogout }: { onClose(): void; onLogout(): void }) {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const { basics } = useResume()
  const [query, setQuery] = useState('')
  const menu = useRef<HTMLDivElement>(null)

  const results = appList.filter((app) => t(app.name).toLowerCase().includes(query.trim().toLowerCase()))

  const launch = (app: AppDef) => {
    onClose()
    os.open(app.id)
  }

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element
      // The menu button toggles the menu itself.
      if (!menu.current?.contains(target) && !target.closest('[data-menu-button]')) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className="menu" ref={menu} role="dialog" aria-label={t('panel.menu')}>
      <label className="menu-search">
        <Search size={16} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) launch(results[0])
          }}
          placeholder={t('menu.search')}
          aria-label={t('menu.search')}
        />
      </label>

      <ul className="menu-apps">
        {results.map((app) => (
          <li key={app.id}>
            <button onClick={() => launch(app)}>
              <AppIcon app={app} size={34} />
              <span>{t(app.name)}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="menu-empty">{t('menu.empty')}</li>}
      </ul>

      <div className="menu-footer">
        <Avatar size={30} />
        <span className="menu-user">{basics.name}</span>
        <a href={classicUrl(locale)}>{t('common.classic')}</a>
        <button onClick={onLogout} title={t('menu.logout')} aria-label={t('menu.logout')}>
          <Power size={16} />
        </button>
      </div>
    </div>
  )
}
