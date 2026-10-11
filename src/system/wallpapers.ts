import { useSettings } from './settings.ts'

// Wallpapers are pure CSS, so they cost nothing to download and scale to any screen.

export interface Wallpaper {
  id: string
  name: string
  css: string
}

export const wallpapers: Wallpaper[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    css: `radial-gradient(90% 70% at 85% 8%, #7fdcff 0%, transparent 60%),
      radial-gradient(80% 80% at 8% 95%, #7a5cff 0%, transparent 62%),
      radial-gradient(60% 50% at 55% 60%, #19b5f5 0%, transparent 70%),
      linear-gradient(135deg, #0b6fd0 0%, #1b4fb8 55%, #2a2f8f 100%)`,
  },
  {
    id: 'dunes',
    name: 'Dunas',
    css: `radial-gradient(80% 60% at 80% 15%, #ffd28a 0%, transparent 60%),
      radial-gradient(90% 70% at 10% 100%, #c2416b 0%, transparent 65%),
      linear-gradient(160deg, #ff9966 0%, #e8615a 50%, #7b3f8c 100%)`,
  },
  {
    id: 'forest',
    name: 'Floresta',
    css: `radial-gradient(70% 60% at 15% 10%, #9df2c2 0%, transparent 60%),
      radial-gradient(90% 80% at 95% 95%, #0d5c63 0%, transparent 65%),
      linear-gradient(150deg, #2fbf8a 0%, #178a78 50%, #0f4c5c 100%)`,
  },
  {
    id: 'graphite',
    name: 'Grafite',
    css: `radial-gradient(70% 60% at 80% 10%, #5a6474 0%, transparent 60%),
      radial-gradient(90% 80% at 5% 100%, #15a6f0 0%, transparent 55%),
      linear-gradient(145deg, #3a414d 0%, #252a33 55%, #16191f 100%)`,
  },
]

export function useWallpaper(): Wallpaper {
  const id = useSettings((s) => s.wallpaper)
  return wallpapers.find((wallpaper) => wallpaper.id === id) ?? wallpapers[0]
}
