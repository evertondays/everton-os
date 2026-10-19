import { FileText } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'viewer',
  name: { pt: 'Visualizador de documentos', en: 'Document Viewer' },
  icon: FileText,
  tint: ['#ff7a70', '#d93a3a'],
  window: { width: 760, height: 640 },
  order: 3,
  handles: { mime: ['text/markdown', 'application/pdf', 'image/*'] },
  entry: () => import('./Viewer.tsx'),
})
