import type { Locale } from '../data/localize.ts'

const intlLocale = (locale: Locale) => (locale === 'pt' ? 'pt-BR' : 'en-US')

/** Formats a "YYYY-MM" (or "YYYY") date as "mar. de 2024" / "Mar 2024". */
export function formatMonth(date: string, locale: Locale): string {
  const [year, month] = date.split('-').map(Number)
  if (!month) return String(year)
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
}

export function formatPeriod(start: string, end: string | null, locale: Locale): string {
  const present = locale === 'pt' ? 'atual' : 'present'
  return `${formatMonth(start, locale)} – ${end ? formatMonth(end, locale) : present}`
}

export function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatDate(date: Date, locale: Locale, style: 'short' | 'long' = 'long'): string {
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { day: '2-digit', month: 'short' },
  ).format(date)
}
