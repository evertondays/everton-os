import { ChevronDown, ChevronUp } from 'lucide-react'
import { type WheelEvent, useEffect, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import { useLocale, useT } from '../../i18n/index.ts'
import {
  type Month,
  addMonths,
  fullDate,
  monthGrid,
  monthOf,
  monthTitle,
  sameDay,
  sameMonth,
  weekdayNames,
} from '../../system/calendar.ts'
import { formatTime } from '../../system/format.ts'
import { useClock } from '../../system/useClock.ts'

/**
 * The calendar that opens from the clock, like Windows': the time with its
 * seconds and today's date on top (a chevron folds the calendar away), then
 * the month with arrows to move through the months. The mouse wheel over the
 * days moves too.
 */
export function CalendarFlyout({ onClose }: { onClose(): void }) {
  const t = useT()
  const locale = useLocale()
  // Ticks every second: the flyout shows the seconds.
  const now = useClock(1000)
  const [shown, setShown] = useState<Month>(() => monthOf(new Date()))
  const [selected, setSelected] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  // The wheel fires in bursts; one notch moves one month.
  const lastWheel = useRef(0)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element
      // The clock toggles the calendar itself.
      if (!box.current?.contains(target) && !target.closest('[data-clock-button]')) onClose()
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

  const move = (delta: number, method: 'button' | 'wheel') => {
    setShown((month) => addMonths(month, delta))
    track('calendar_navigated', { direction: delta < 0 ? 'previous' : 'next', method, shell: 'desktop' })
  }

  const backToToday = () => {
    if (!sameMonth(shown, monthOf(now))) track('calendar_navigated', { direction: 'today', method: 'button', shell: 'desktop' })
    setShown(monthOf(now))
    setSelected(null)
    setExpanded(true)
  }

  const onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0 || event.timeStamp - lastWheel.current < 250) return
    lastWheel.current = event.timeStamp
    move(event.deltaY > 0 ? 1 : -1, 'wheel')
  }

  return (
    <div className="calendar-flyout" ref={box} role="dialog" aria-label={t('app.calendar')}>
      <div className="calendar-flyout-head">
        <div className="calendar-flyout-now">
          <time className="calendar-flyout-clock" dateTime={now.toISOString()}>
            {formatTime(now, locale, true)}
          </time>
          <button className="calendar-flyout-date" onClick={backToToday} title={t('calendar.today')}>
            {fullDate(now, locale)}
          </button>
        </div>
        <button
          className="icon-button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? t('calendar.collapse') : t('calendar.expand')}
          title={expanded ? t('calendar.collapse') : t('calendar.expand')}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="calendar-flyout-body" onWheel={onWheel}>
          <div className="calendar-flyout-month">
            <span aria-live="polite">{monthTitle(shown, locale)}</span>
            <button
              className="calendar-flyout-arrow"
              onClick={() => move(-1, 'button')}
              aria-label={t('calendar.previous')}
              title={t('calendar.previous')}
            >
              <ChevronUp size={16} />
            </button>
            <button
              className="calendar-flyout-arrow"
              onClick={() => move(1, 'button')}
              aria-label={t('calendar.next')}
              title={t('calendar.next')}
            >
              <ChevronDown size={16} />
            </button>
          </div>

          <div className="calendar-flyout-grid">
            {weekdayNames(locale, 'narrow').map((name, index) => (
              <span key={index} className="calendar-flyout-weekday" aria-hidden>
                {name}
              </span>
            ))}
            {monthGrid(shown, now).map(({ date, inMonth, today }) => (
              <button
                key={date.toISOString()}
                className={`calendar-flyout-day${inMonth ? '' : ' is-outside'}${today ? ' is-today' : ''}${
                  selected && sameDay(selected, date) ? ' is-selected' : ''
                }`}
                aria-label={fullDate(date, locale)}
                aria-current={today ? 'date' : undefined}
                onClick={() => setSelected(date)}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
