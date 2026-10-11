import type { AppDef } from '../system/apps.ts'

/** The rounded gradient tile used for app icons in both shells. */
export function AppIcon({ app, size = 48 }: { app: Pick<AppDef, 'icon' | 'tint'>; size?: number }) {
  const Icon = app.icon
  return (
    <span
      className="app-icon"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: `linear-gradient(145deg, ${app.tint[0]}, ${app.tint[1]})`,
      }}
      aria-hidden
    >
      <Icon size={size * 0.54} strokeWidth={1.9} />
    </span>
  )
}
