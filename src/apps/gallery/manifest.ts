import { Images } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'gallery',
  name: { pt: 'Galeria', en: 'Gallery' },
  icon: Images,
  tint: ['#ffb14a', '#f0703a'],
  window: { width: 800, height: 560 },
  order: 6,
  single: true,
  handles: { mime: ['image/*'] },
  entry: () => import('./Gallery.tsx'),
})
