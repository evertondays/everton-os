import { Folder } from 'lucide-react'
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
})
