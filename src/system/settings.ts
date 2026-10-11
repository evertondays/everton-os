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

function apply({ theme, locale }: Settings) {
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en'
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
