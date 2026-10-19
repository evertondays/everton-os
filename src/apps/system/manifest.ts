import { Cpu } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'system',
  name: { pt: 'Sobre o sistema', en: 'About the system' },
  icon: Cpu,
  tint: ['#c08bff', '#8548d6'],
  window: { width: 700, height: 500 },
  order: 11,
  single: true,
  entry: () => import('./SystemInfo.tsx'),
})
