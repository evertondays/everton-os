import { ArrowUpRight, createLucideIcon } from 'lucide-react'
import { type Tile, useTrashFull } from '../sdk/index.ts'

/**
 * The Trash when it has something in it: Lucide's trash can stuffed so full
 * that its sides and lid bulge.
 */
const TrashFull = createLucideIcon('trash-full', [
  ['path', { d: 'M5 6C2.9 10.3 2.9 15.7 4.8 20A2.6 2.6 0 0 0 7.2 22h9.6a2.6 2.6 0 0 0 2.4-2c1.9-4.3 1.9-9.7-.2-14', key: 'body' }],
  ['path', { d: 'M3 6c3.5-1.2 14.5-1.2 18 0', key: 'lid' }],
  ['path', { d: 'M8.5 5V3.8A1.8 1.8 0 0 1 10.3 2h3.4a1.8 1.8 0 0 1 1.8 1.8V5', key: 'handle' }],
  ['path', { d: 'M9.6 10.5c-.6 2.4-.6 5.1 0 7.5', key: 'line-left' }],
  ['path', { d: 'M14.4 10.5c.6 2.4.6 5.1 0 7.5', key: 'line-right' }],
])

/**
 * The rounded gradient tile used for app and file icons in both shells.
 * `link` adds the little arrow of a shortcut (a symlink).
 */
export function AppIcon({ app, size = 48, link = false }: { app: Tile; size?: number; link?: boolean }) {
  // The Trash shows whether the visitor has put anything in it, wherever its icon appears.
  const trashFull = useTrashFull()
  const Icon = app.id === 'trash' && trashFull ? TrashFull : app.icon
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
      {link && (
        <span className="app-icon-link" style={{ width: size * 0.36, height: size * 0.36 }}>
          <ArrowUpRight size={size * 0.28} strokeWidth={2.6} />
        </span>
      )}
    </span>
  )
}
