import type { ComponentType } from 'react'
import type { Locale } from '../data/localize.ts'
import type { AppManifest, AppProps, Shell } from '../sdk/app.ts'

// The installed apps: every src/apps/*/manifest.ts. Only the manifests are
// bundled with the system; each app's component stays its own chunk, loaded
// ahead of time when the browser is idle (preloadApps) or when it's opened.

export type AppId = string

export interface AppDef extends AppManifest {
  width: number
  height: number
  /** Loads the component, once; resolves with it. */
  load(): Promise<ComponentType<AppProps>>
  /** The component if it's loaded, else null. */
  loaded(): ComponentType<AppProps> | null
}

const DEFAULT_WINDOW = { width: 720, height: 480 }
/** Where apps without an `order` go: after the others. */
const LAST = 1000

const modules = import.meta.glob<{ default: AppManifest }>('../apps/*/manifest.ts', { eager: true })

function toAppDef(manifest: AppManifest): AppDef {
  let component: ComponentType<AppProps> | null = null
  let loading: Promise<ComponentType<AppProps>> | null = null
  return {
    ...manifest,
    ...(manifest.window ?? DEFAULT_WINDOW),
    load() {
      loading ??= manifest.entry().then(
        (module) => (component = module.default),
        (error: unknown) => {
          // Try again next time (a network hiccup, a deploy that just happened).
          loading = null
          throw error
        },
      )
      return loading
    },
    loaded: () => component,
  }
}

export const apps: ReadonlyMap<AppId, AppDef> = new Map(
  Object.values(modules).map(({ default: manifest }) => [manifest.id, toAppDef(manifest)]),
)

/** Every app, in the order of the menu (desktop) and the home screen (mobile). */
export const appList: AppDef[] = [...apps.values()].toSorted(
  (a, b) => (a.order ?? LAST) - (b.order ?? LAST) || a.id.localeCompare(b.id),
)

const offeredIn = (app: AppDef, shell: Shell) => !app.shells || app.shells.includes(shell)

/** The apps a shell can run. */
export const runnableIn = (shell: Shell) => appList.filter((app) => offeredIn(app, shell))

/** The apps a shell lists in its menu or home screen, and that the Terminal can open there. */
export const appsFor = (shell: Shell) => runnableIn(shell).filter((app) => app.listed !== false)

export const appName = (app: AppManifest, locale: Locale) => app.name[locale]

let preloading = false

/** Whether apps are being loaded ahead of time: a failure then is no reason to reload the page (main.tsx). */
export const isPreloading = () => preloading

/**
 * Loads the apps of `shell` ahead of time, one after another, once the
 * browser is idle, so they open at once. A few dozen kB, cached afterwards.
 */
export function preloadApps(shell: Shell) {
  const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1000))
  idle(async () => {
    for (const app of runnableIn(shell)) {
      if (app.loaded()) continue
      preloading = true
      try {
        await app.load()
      } catch {
        // Offline, or a deploy removed the chunk: it loads (or fails visibly) when opened.
      } finally {
        preloading = false
      }
    }
  })
}
