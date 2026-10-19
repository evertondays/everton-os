import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type PointerEvent, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import {
  type Month,
  addMonths,
  fullDate,
  isoWeek,
  monthGrid,
  monthOf,
  monthTitle,
  relativeDay,
  sameDay,
  sameMonth,
  useClock,
  useLocale,
  useT,
  weekdayNames,
} from '../../sdk/index.ts'

/** Horizontal travel (px) that turns a touch into a swipe to the next or previous month. */
const SWIPE_DISTANCE = 50

/**
 * The phone's Calendar app, in the style of iOS: the year over a large month
 * name, a swipe (or the arrows) to change months, and the day picked below.
 * On the desktop the calendar opens from the panel's clock instead.
 */
export default function Calendar() {
  const t = useT()
  const locale = useLocale()
  const now = useClock()
  const [shown, setShown] = useState<Month>(() => monthOf(new Date()))
  const [selected, setSelected] = useState(() => new Date())
  const swipeStart = useRef<number | null>(null)

  const move = (delta: number, method: 'button' | 'swipe') => {
    setShown((month) => addMonths(month, delta))
    track('calendar_navigated', { direction: delta < 0 ? 'previous' : 'next', method, shell: 'mobile' })
  }

  const goToday = () => {
    track('calendar_navigated', { direction: 'today', method: 'button', shell: 'mobile' })
    setShown(monthOf(now))
    setSelected(now)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (swipeStart.current === null) return
    const distance = event.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(distance) >= SWIPE_DISTANCE) move(distance < 0 ? 1 : -1, 'swipe')
  }

  const relative = relativeDay(selected, now, locale)
  const onToday = sameMonth(shown, monthOf(now)) && sameDay(selected, now)

  return (
    <div className="app calendar-app">
      <header className="calendar-app-head">
        <div>
          <span className="calendar-app-year">{shown.year}</span>
          <h2 aria-live="polite">{monthTitle(shown, locale, false)}</h2>
        </div>
        <nav className="calendar-app-nav">
          <button className="icon-button" onClick={() => move(-1, 'button')} aria-label={t('calendar.previous')}>
            <ChevronLeft size={22} />
          </button>
          <button className="calendar-app-today" onClick={goToday} disabled={onToday}>
            {t('calendar.today')}
          </button>
          <button className="icon-button" onClick={() => move(1, 'button')} aria-label={t('calendar.next')}>
            <ChevronRight size={22} />
          </button>
        </nav>
      </header>

      <div className="calendar-app-weekdays" aria-hidden>
        {weekdayNames(locale, 'narrow').map((name, index) => (
          <span key={index}>{name}</span>
        ))}
      </div>

      <div
        className="calendar-app-grid"
        onPointerDown={(event) => {
          swipeStart.current = event.clientX
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeStart.current = null
        }}
      >
        {monthGrid(shown, now).map(({ date, inMonth, today }) =>
          // Like iOS, the month stands alone: the neighbours' days are left blank.
          inMonth ? (
            <button
              key={date.toISOString()}
              className={`calendar-app-day${today ? ' is-today' : ''}${sameDay(date, selected) ? ' is-selected' : ''}`}
              aria-label={fullDate(date, locale)}
              aria-current={today ? 'date' : undefined}
              aria-pressed={sameDay(date, selected)}
              onClick={() => setSelected(date)}
            >
              {date.getDate()}
            </button>
          ) : (
            <span key={date.toISOString()} />
          ),
        )}
      </div>

      <section className="calendar-app-detail" aria-live="polite">
        <span className="calendar-app-relative">{relative.charAt(0).toUpperCase() + relative.slice(1)}</span>
        <h3>{fullDate(selected, locale)}</h3>
        <span className="calendar-app-week">{t('calendar.week', { week: isoWeek(selected) })}</span>
      </section>
    </div>
  )
}
