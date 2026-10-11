export type Locale = 'pt' | 'en'

export const locales: Locale[] = ['pt', 'en']

/** Replaces every `{ "pt": …, "en": … }` object in the tree with the value for `locale`. */
export function localize(value: unknown, locale: Locale): unknown {
  if (Array.isArray(value)) return value.map((item) => localize(item, locale))
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    const keys = Object.keys(object)
    if (keys.length === 2 && 'pt' in object && 'en' in object) return object[locale]
    return Object.fromEntries(keys.map((key) => [key, localize(object[key], locale)]))
  }
  return value
}
