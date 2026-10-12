import { type SettingsSource, setContext, track } from '../analytics.ts'
import type { Locale } from '../data/localize.ts'
import { createStore, useStore } from './store.ts'

export type Theme = 'light' | 'dark'

export interface Settings {
  theme: Theme
  wallpaper: string
  locale: Locale
  /** False until the first visit has been greeted with the About me app. */
  visited: boolean
}

const KEY = 'everton-os:settings'

function load(): Settings {
  const settings: Settings = {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    wallpaper: 'aurora',
    locale: navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en',
    visited: false,
  }
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'))
  } catch {
    // Storage blocked or corrupted: keep the defaults.
  }
  // ?lang=en lets a link force the language.
  const lang = new URLSearchParams(window.location.search).get('lang')
  if (lang === 'pt' || lang === 'en') settings.locale = lang
  return settings
}

function apply({ theme, locale, wallpaper }: Settings) {
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en'
  setContext({ theme, language: locale, wallpaper })
}

export const settings = createStore<Settings>(load())

apply(settings.get())
settings.subscribe(() => {
  const state = settings.get()
  apply(state)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Preferences just won't persist.
  }
})

export function useSettings<S>(selector: (settings: Settings) => S): S {
  return useStore(settings, selector)
}

// Preferences the visitor changes by hand. `source` is where from, for analytics.

export function setTheme(theme: Theme, source: SettingsSource) {
  if (settings.get().theme === theme) return
  settings.set({ theme })
  track('theme_changed', { theme, source })
}

export function setLocale(locale: Locale, source: SettingsSource) {
  if (settings.get().locale === locale) return
  settings.set({ locale })
  track('language_changed', { language: locale, source })
}

export function setWallpaper(wallpaper: string, source: SettingsSource) {
  if (settings.get().wallpaper === wallpaper) return
  settings.set({ wallpaper })
  track('wallpaper_changed', { wallpaper, source })
}
