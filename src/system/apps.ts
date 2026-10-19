import { type ComponentType, type LazyExoticComponent, lazy } from 'react'
import type { Locale } from '../data/localize.ts'
import type { AppManifest, AppProps, Shell } from '../sdk/app.ts'

// The installed apps: every src/apps/*/manifest.ts. Only the manifests are
// bundled with the system; each app's component stays its own chunk.

export type AppId = string

export interface AppDef extends AppManifest {
  component: LazyExoticComponent<ComponentType<AppProps>>
  width: number
  height: number
}

const DEFAULT_WINDOW = { width: 720, height: 480 }
/** Where apps without an `order` go: after the others. */
const LAST = 1000

const modules = import.meta.glob<{ default: AppManifest }>('../apps/*/manifest.ts', { eager: true })

const toAppDef = (manifest: AppManifest): AppDef => ({
  ...manifest,
  component: lazy(manifest.entry),
  ...(manifest.window ?? DEFAULT_WINDOW),
})

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
