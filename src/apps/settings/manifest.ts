import { Settings } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'settings',
  name: { pt: 'Configurações', en: 'Settings' },
  icon: Settings,
  tint: ['#a7b0bc', '#6a7482'],
  window: { width: 620, height: 560 },
  order: 12,
  single: true,
  entry: () => import('./Settings.tsx'),
})
