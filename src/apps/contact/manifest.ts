import { Mail } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'contact',
  name: { pt: 'Contato', en: 'Contact' },
  icon: Mail,
  tint: ['#45d6c4', '#0e9aa8'],
  window: { width: 520, height: 620 },
  order: 9,
  single: true,
  entry: () => import('./Contact.tsx'),
})
