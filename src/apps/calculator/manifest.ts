import { Calculator } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'calculator',
  name: { pt: 'Calculadora', en: 'Calculator' },
  icon: Calculator,
  tint: ['#5fd98b', '#1fa86a'],
  window: { width: 340, height: 500 },
  order: 10,
  single: true,
  entry: () => import('./Calculator.tsx'),
})
