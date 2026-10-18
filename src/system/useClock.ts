import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `interval` ms on the dot (so a seconds
 * display ticks with the real clock). The default keeps a minute display right.
 */
export function useClock(interval = 5000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer = 0
    const tick = () => {
      setNow(new Date())
      timer = window.setTimeout(tick, interval - (Date.now() % interval))
    }
    timer = window.setTimeout(tick, interval - (Date.now() % interval))
    return () => window.clearTimeout(timer)
  }, [interval])
  return now
}
