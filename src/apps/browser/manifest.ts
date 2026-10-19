import { Globe } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'browser',
  name: { pt: 'Navegador', en: 'Browser' },
  icon: Globe,
  tint: ['#58b4ff', '#3464e0'],
  window: { width: 960, height: 640 },
  order: 8,
  handles: { mime: ['application/x-url'], schemes: ['http', 'https'] },
  entry: () => import('./Browser.tsx'),
})
