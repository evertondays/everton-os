import { CalendarDays } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'calendar',
  name: { pt: 'Calendário', en: 'Calendar' },
  icon: CalendarDays,
  tint: ['#ff7aa8', '#e64980'],
  window: { width: 380, height: 640 },
  order: 7,
  single: true,
  // The desktop has it in the panel's clock instead.
  shells: ['mobile'],
  entry: () => import('./Calendar.tsx'),
})
