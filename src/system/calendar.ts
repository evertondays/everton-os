import type { Locale } from '../data/localize.ts'

// Month grids for the calendar: the desktop's flyout and the phone's app draw
// the same weeks in their own way. Weeks start on Sunday, as in both languages.

const intlLocale = (locale: Locale) => (locale === 'pt' ? 'pt-BR' : 'en-US')

export interface CalendarDay {
  date: Date
  /** In the month being shown (not a neighbour's day filling the first or last week). */
  inMonth: boolean
  today: boolean
}

/** A month: its year and its index (0 = January). */
export interface Month {
  year: number
  month: number
}

export const monthOf = (date: Date): Month => ({ year: date.getFullYear(), month: date.getMonth() })

/** The month `delta` months after (or before, when negative) `from`. */
export function addMonths({ year, month }: Month, delta: number): Month {
  const date = new Date(year, month + delta, 1)
  return monthOf(date)
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month

/** Always six weeks, so the grid keeps its height from month to month, like Windows' calendar. */
export function monthGrid({ year, month }: Month, today: Date): CalendarDay[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return { date, inMonth: date.getMonth() === month, today: sameDay(date, today) }
  })
}

/** Weekday names from Sunday: "D S T Q Q S S" (narrow) or "dom. seg. ter." (short). */
export function weekdayNames(locale: Locale, style: 'narrow' | 'short'): string[] {
  const format = new Intl.DateTimeFormat(intlLocale(locale), { weekday: style })
  // 2026-10-04 is a Sunday.
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 9, 4 + index)).replace('.', ''))
}

/** "outubro de 2026" / "October 2026", or just the month's name. */
export function monthTitle({ year, month }: Month, locale: Locale, withYear = true): string {
  return new Intl.DateTimeFormat(intlLocale(locale), withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(
    new Date(year, month, 1),
  )
}

/** "domingo, 18 de outubro de 2026" / "Sunday, October 18, 2026". */
export function fullDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'full' }).format(date)
}

/** "hoje", "amanhã", "daqui a 3 dias", "há 2 dias"... relative to `today`. */
export function relativeDay(date: Date, today: Date, locale: Locale): string {
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  const days = Math.round((day(date) - day(today)) / 86_400_000)
  return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' }).format(days, 'day')
}

/** The ISO week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: Date): number {
  // The Thursday of the same week decides the year the week belongs to.
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7)
}
