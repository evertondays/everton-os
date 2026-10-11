import { useEffect, useState } from 'react'

/** The current time, refreshed often enough to keep a minute display right. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
