import { useEffect, useState } from 'react'
import { track } from '../../analytics.ts'
import { useT } from '../../i18n/index.ts'

const LINE_INTERVAL = 240

/** A short terminal-style boot. Lasts under 3 s; any key or click skips it. */
export function Boot({ onDone }: { onDone(): void }) {
  const t = useT()
  const lines = t('boot.lines').split('\n')
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setShown((count) => count + 1), LINE_INTERVAL)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (shown > lines.length) onDone()
  }, [shown, lines.length, onDone])

  useEffect(() => {
    const skip = (event: Event) => {
      track('boot_skipped', { method: event.type === 'keydown' ? 'keyboard' : 'pointer' })
      onDone()
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [onDone])

  return (
    <div className="boot" role="status">
      <div className="boot-log">
        {lines.slice(0, shown).map((line) => (
          <div key={line}>
            <span className="boot-ok">[  OK  ]</span> {line}
          </div>
        ))}
      </div>
      <p className="boot-skip">{t('boot.skip')}</p>
    </div>
  )
}
