import { createLucideIcon } from 'lucide-react'
import { type AppDef, apps } from '../system/apps.ts'
import { useTrashFull } from '../system/fileOps.ts'

/** Lucide's trash can without its lid, with paper sticking out: the Trash when it has something in it. */
const TrashFull = createLucideIcon('trash-full', [
  ['path', { d: 'M10 13v5', key: 'line-left' }],
  ['path', { d: 'M14 13v5', key: 'line-right' }],
  ['path', { d: 'M19 9v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9', key: 'body' }],
  ['path', { d: 'M3 9h18', key: 'rim' }],
  ['path', { d: 'M7 9l1.5-5.5 4 1.2L11 9', key: 'paper-left' }],
  ['path', { d: 'M13.5 9 16 3l3 1.6L17.5 9', key: 'paper-right' }],
])

/** The rounded gradient tile used for app icons in both shells. `ink` colors the glyph (white by default). */
export function AppIcon({
  app,
  size = 48,
}: {
  app: Pick<AppDef, 'icon' | 'tint'> & { ink?: string }
  size?: number
}) {
  // The Trash shows whether the visitor has put anything in it, wherever its icon appears.
  const trashFull = useTrashFull()
  const Icon = app === apps.trash && trashFull ? TrashFull : app.icon
  return (
    <span
      className="app-icon"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: `linear-gradient(145deg, ${app.tint[0]}, ${app.tint[1]})`,
        color: app.ink,
      }}
      aria-hidden
    >
      <Icon size={size * 0.54} strokeWidth={1.9} />
    </span>
  )
}
