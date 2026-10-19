import { User } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'about',
  name: { pt: 'Sobre mim', en: 'About me' },
  icon: User,
  tint: ['#8f9bff', '#5a55e0'],
  window: { width: 520, height: 600 },
  order: 1,
  single: true,
  entry: () => import('./About.tsx'),
})
