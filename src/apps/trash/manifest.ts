import { Trash } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'trash',
  name: { pt: 'Lixeira', en: 'Trash' },
  icon: Trash,
  tint: ['#b9c1cc', '#7d8794'],
  window: { width: 700, height: 460 },
  order: 13,
  single: true,
  // On the phone the Trash is a tab of the Drive.
  shells: ['desktop'],
  entry: () => import('./Trash.tsx'),
})
