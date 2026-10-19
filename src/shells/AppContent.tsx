import { type ComponentType, useEffect, useState } from 'react'
import type { AppProps, LaunchArgs } from '../sdk/app.ts'
import type { AppDef } from '../system/apps.ts'

/**
 * An app's component, shared by windows (desktop) and screens (mobile).
 * Usually it's loaded already (see preloadApps) and shows at once. If not, a
 * blank surface stands in until it is. Not a Suspense boundary: React holds
 * back what a boundary reveals for 300 ms, which made every first open slow.
 */
export function AppContent({ app, args }: { app: AppDef; args: LaunchArgs }) {
  const [App, setApp] = useState<ComponentType<AppProps> | null>(() => app.loaded())
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (App) return
    let live = true
    app.load().then(
      (component) => live && setApp(() => component),
      (caught: unknown) => live && setError(() => caught ?? new Error(`Could not load ${app.id}`)),
    )
    return () => {
      live = false
    }
  }, [app, App])

  // As before with lazy(): a chunk that can't load is an error for error tracking (main.tsx reloads first).
  if (error) throw error
  return App ? <App args={args} /> : <div className="app-loading" />
}
