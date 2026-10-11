import { type KeyboardEvent, useReducer } from 'react'
import { useLocale } from '../i18n/index.ts'
import { useOS } from '../system/os.ts'

type Operator = '+' | '-' | '×' | '÷'

interface State {
  /** What is on the display, as typed. */
  display: string
  /** The left-hand operand of the pending operation. */
  stored: number | null
  operator: Operator | null
  /** The next digit starts a new number instead of extending the display. */
  fresh: boolean
}

type Action =
  | { type: 'digit'; digit: string }
  | { type: 'operator'; operator: Operator }
  | { type: 'equals' | 'clear' | 'negate' | 'percent' | 'backspace' }

const initial: State = { display: '0', stored: null, operator: null, fresh: true }

function compute(a: number, b: number, operator: Operator): number {
  if (operator === '+') return a + b
  if (operator === '-') return a - b
  if (operator === '×') return a * b
  return a / b
}

/** Trims floating point noise (0.1 + 0.2) without losing real precision. */
const show = (value: number) => (Number.isFinite(value) ? String(Number(value.toPrecision(12))) : 'Erro')

function reducer(state: State, action: Action): State {
  const value = Number(state.display)
  switch (action.type) {
    case 'digit': {
      if (state.fresh) {
        return { ...state, display: action.digit === '.' ? '0.' : action.digit, fresh: false }
      }
      if (action.digit === '.' && state.display.includes('.')) return state
      if (state.display.replace(/\D/g, '').length >= 12) return state
      return { ...state, display: state.display === '0' && action.digit !== '.' ? action.digit : state.display + action.digit }
    }
    case 'operator': {
      // Chained operations (2 + 3 ×) resolve the pending one first.
      const stored =
        state.stored !== null && state.operator && !state.fresh ? compute(state.stored, value, state.operator) : value
      if (Number.isNaN(stored)) return initial
      return { display: show(stored), stored, operator: action.operator, fresh: true }
    }
    case 'equals': {
      if (state.stored === null || !state.operator) return state
      return { display: show(compute(state.stored, value, state.operator)), stored: null, operator: null, fresh: true }
    }
    case 'negate':
      return Number.isNaN(value) ? state : { ...state, display: show(-value) }
    case 'percent':
      return Number.isNaN(value) ? state : { ...state, display: show(value / 100) }
    case 'backspace':
      return state.fresh ? state : { ...state, display: state.display.slice(0, -1) || '0' }
    case 'clear':
      return initial
  }
}

const KEYS: { label: string; action: Action; kind?: 'function' | 'operator'; wide?: boolean }[] = [
  { label: 'AC', action: { type: 'clear' }, kind: 'function' },
  { label: '±', action: { type: 'negate' }, kind: 'function' },
  { label: '%', action: { type: 'percent' }, kind: 'function' },
  { label: '÷', action: { type: 'operator', operator: '÷' }, kind: 'operator' },
  ...keypadRow(['7', '8', '9'], '×'),
  ...keypadRow(['4', '5', '6'], '-'),
  ...keypadRow(['1', '2', '3'], '+'),
  { label: '0', action: { type: 'digit', digit: '0' }, wide: true },
  { label: ',', action: { type: 'digit', digit: '.' } },
  { label: '=', action: { type: 'equals' }, kind: 'operator' },
]

function keypadRow(digits: string[], operator: Operator): typeof KEYS {
  return [
    ...digits.map((digit) => ({ label: digit, action: { type: 'digit' as const, digit } })),
    { label: operator === '-' ? '−' : operator, action: { type: 'operator', operator }, kind: 'operator' },
  ]
}

const KEYBOARD: Record<string, Action> = {
  '+': { type: 'operator', operator: '+' },
  '-': { type: 'operator', operator: '-' },
  '*': { type: 'operator', operator: '×' },
  '/': { type: 'operator', operator: '÷' },
  Enter: { type: 'equals' },
  '=': { type: 'equals' },
  Escape: { type: 'clear' },
  Backspace: { type: 'backspace' },
  '%': { type: 'percent' },
  '.': { type: 'digit', digit: '.' },
  ',': { type: 'digit', digit: '.' },
}

/** A basic calculator. Each shell styles it its own way (see `data-shell` in the CSS). */
export default function CalculatorApp() {
  const { shell } = useOS()
  const locale = useLocale()
  const [state, dispatch] = useReducer(reducer, initial)

  const onKeyDown = (event: KeyboardEvent) => {
    const action = /^\d$/.test(event.key) ? ({ type: 'digit', digit: event.key } as const) : KEYBOARD[event.key]
    if (!action) return
    event.preventDefault()
    dispatch(action)
  }

  const display = locale === 'pt' ? state.display.replace('.', ',') : state.display

  return (
    <div
      className="app calculator"
      data-shell={shell}
      tabIndex={0}
      onKeyDown={onKeyDown}
      ref={(element) => {
        // Take the keyboard as soon as the app opens.
        if (element && !element.contains(document.activeElement)) element.focus()
      }}
    >
      <output className="calculator-display" aria-live="polite">
        {display}
      </output>
      <div className="calculator-keys">
        {KEYS.map((key) => (
          <button
            key={key.label}
            className={`calculator-key${key.kind ? ` is-${key.kind}` : ''}${key.wide ? ' is-wide' : ''}`}
            onClick={() => dispatch(key.action)}
          >
            {key.label === ',' && locale === 'en' ? '.' : key.label}
          </button>
        ))}
      </div>
    </div>
  )
}
