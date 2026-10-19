import { NotebookPen } from 'lucide-react'
import { defineApp } from '../../sdk/app.ts'

export default defineApp({
  id: 'editor',
  name: { pt: 'Editor de texto', en: 'Text Editor' },
  icon: NotebookPen,
  tint: ['#ffd36b', '#e89a1c'],
  window: { width: 680, height: 520 },
  order: 4,
  // Text of any kind, and files it can't tell apart, like a plain text editor.
  handles: { mime: ['text/*', 'application/json', 'application/octet-stream'] },
  entry: () => import('./Editor.tsx'),
})
