import { Cloud, Folder } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'files',
  name: { pt: 'Arquivos', en: 'Files' },
  icon: Folder,
  tint: ['#4fc3ff', '#1589e0'],
  window: { width: 820, height: 520 },
  order: 2,
  handles: { mime: ['inode/directory'] },
  entry: () => import('./Files.tsx'),
  // On the phone, files live in a Drive: lists, a bottom sheet of actions, the Trash as a tab.
  mobile: {
    name: { pt: 'Drive', en: 'Drive' },
    icon: Cloud,
    tint: ['#5cc8ff', '#2f6fe0'],
    entry: () => import('./Drive.tsx'),
  },
})
