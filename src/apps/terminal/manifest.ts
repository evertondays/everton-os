import { Terminal } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'terminal',
  name: { pt: 'Terminal', en: 'Terminal' },
  icon: Terminal,
  tint: ['#4a5260', '#22262d'],
  window: { width: 720, height: 460 },
  order: 5,
  entry: () => import('./Terminal.tsx'),
})
