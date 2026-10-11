import { useSettings } from '../system/settings.ts'
import raw from './curriculo.json'
import { type Locale, localize } from './localize.ts'
import type { Resume } from './types.ts'

const cache = new Map<Locale, Resume>()

export function getResume(locale: Locale): Resume {
  let resume = cache.get(locale)
  if (!resume) {
    resume = localize(raw, locale) as Resume
    cache.set(locale, resume)
  }
  return resume
}

export function useResume(): Resume {
  return getResume(useSettings((s) => s.locale))
}
