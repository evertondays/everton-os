import { useCallback } from 'react'
import type { Locale } from '../data/localize.ts'
import { useSettings } from '../system/settings.ts'
import { type TKey, translate } from './dict.ts'

export type Translate = (key: TKey, vars?: Record<string, string | number>) => string

export function useLocale(): Locale {
  return useSettings((s) => s.locale)
}

export function useT(): Translate {
  const locale = useLocale()
  return useCallback((key, vars) => translate(locale, key, vars), [locale])
}
