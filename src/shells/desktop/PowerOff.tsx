import { Power } from 'lucide-react'
import { useEffect } from 'react'
import { useT } from '../../i18n/index.ts'

/** After `shutdown`: a black screen with a power button. Any key or the button turns the system on again (boot). */
export function PowerOff({ onPowerOn }: { onPowerOn(): void }) {
  const t = useT()

  useEffect(() => {
    window.addEventListener('keydown', onPowerOn)
    return () => window.removeEventListener('keydown', onPowerOn)
  }, [onPowerOn])

  return (
    <div className="power-off">
      <button className="power-off-button" onClick={onPowerOn} aria-label={t('power.on')} title={t('power.on')}>
        <Power size={30} />
      </button>
      <p>{t('power.off')}</p>
    </div>
  )
}
