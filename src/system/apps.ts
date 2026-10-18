import {
  Calculator,
  Cpu,
  FileText,
  FileUser,
  Folder,
  Globe,
  Images,
  type LucideIcon,
  Mail,
  NotebookPen,
  Settings,
  Terminal,
  Trash,
  User,
} from 'lucide-react'
import { type ComponentType, type LazyExoticComponent, lazy } from 'react'
import type { TKey } from '../i18n/dict.ts'

export type AppId =
  | 'files'
  | 'viewer'
  | 'about'
  | 'terminal'
  | 'gallery'
  | 'calculator'
  | 'contact'
  | 'system'
  | 'browser'
  | 'settings'
  | 'trash'
  | 'editor'

export interface AppArgs {
  /** File system path (Files, Viewer, Editor). */
  path?: string
  /** Address to load (Browser). */
  url?: string
}

export interface AppProps {
  args?: AppArgs
}

export interface AppDef {
  id: AppId
  name: TKey
  icon: LucideIcon
  /** Gradient of the icon tile. */
  tint: [string, string]
  /** Loaded on demand, so each app is its own chunk. */
  component: LazyExoticComponent<ComponentType<AppProps>>
  /** Default window size on the desktop. */
  width: number
  height: number
  /** Only one instance at a time. */
  single?: boolean
}

export const apps: Record<AppId, AppDef> = {
  files: {
    id: 'files',
    name: 'app.files',
    icon: Folder,
    tint: ['#4fc3ff', '#1589e0'],
    component: lazy(() => import('../apps/Files.tsx')),
    width: 820,
    height: 520,
  },
  viewer: {
    id: 'viewer',
    name: 'app.viewer',
    icon: FileText,
    tint: ['#ff7a70', '#d93a3a'],
    component: lazy(() => import('../apps/Viewer.tsx')),
    width: 760,
    height: 640,
  },
  about: {
    id: 'about',
    name: 'app.about',
    icon: User,
    tint: ['#8f9bff', '#5a55e0'],
    component: lazy(() => import('../apps/About.tsx')),
    width: 520,
    height: 600,
    single: true,
  },
  terminal: {
    id: 'terminal',
    name: 'app.terminal',
    icon: Terminal,
    tint: ['#4a5260', '#22262d'],
    component: lazy(() => import('../apps/Terminal.tsx')),
    width: 720,
    height: 460,
  },
  gallery: {
    id: 'gallery',
    name: 'app.gallery',
    icon: Images,
    tint: ['#ffb14a', '#f0703a'],
    component: lazy(() => import('../apps/Gallery.tsx')),
    width: 800,
    height: 560,
    single: true,
  },
  calculator: {
    id: 'calculator',
    name: 'app.calculator',
    icon: Calculator,
    tint: ['#5fd98b', '#1fa86a'],
    component: lazy(() => import('../apps/Calculator.tsx')),
    width: 340,
    height: 500,
    single: true,
  },
  contact: {
    id: 'contact',
    name: 'app.contact',
    icon: Mail,
    tint: ['#45d6c4', '#0e9aa8'],
    component: lazy(() => import('../apps/Contact.tsx')),
    width: 520,
    height: 620,
    single: true,
  },
  system: {
    id: 'system',
    name: 'app.system',
    icon: Cpu,
    tint: ['#c08bff', '#8548d6'],
    component: lazy(() => import('../apps/SystemInfo.tsx')),
    width: 700,
    height: 500,
    single: true,
  },
  browser: {
    id: 'browser',
    name: 'app.browser',
    icon: Globe,
    tint: ['#58b4ff', '#3464e0'],
    component: lazy(() => import('../apps/Browser.tsx')),
    width: 960,
    height: 640,
  },
  settings: {
    id: 'settings',
    name: 'app.settings',
    icon: Settings,
    tint: ['#a7b0bc', '#6a7482'],
    component: lazy(() => import('../apps/Settings.tsx')),
    width: 620,
    height: 560,
    single: true,
  },
  trash: {
    id: 'trash',
    name: 'app.trash',
    icon: Trash,
    tint: ['#b9c1cc', '#7d8794'],
    component: lazy(() => import('../apps/Trash.tsx')),
    width: 700,
    height: 460,
    single: true,
  },
  editor: {
    id: 'editor',
    name: 'app.editor',
    icon: NotebookPen,
    tint: ['#ffd36b', '#e89a1c'],
    component: lazy(() => import('../apps/Editor.tsx')),
    width: 680,
    height: 520,
  },
}

/** How the visitor's own files and folders look as desktop icons. */
export const userNodeIcons: Record<'file' | 'dir', Pick<AppDef, 'icon' | 'tint'>> = {
  file: { icon: FileText, tint: ['#a9b4c2', '#66727f'] },
  dir: { icon: Folder, tint: ['#4fc3ff', '#1589e0'] },
}

/** The shortcut to the résumé file that both shells keep one click away. */
export const resumeShortcut: Pick<AppDef, 'name' | 'icon' | 'tint'> = {
  name: 'app.resume',
  icon: FileUser,
  tint: ['#ff7a70', '#d93a3a'],
}

/** Order of the apps in the menu (desktop) and on the home screen (mobile). */
export const appList: AppDef[] = [
  apps.about,
  apps.files,
  apps.viewer,
  apps.editor,
  apps.terminal,
  apps.gallery,
  apps.browser,
  apps.contact,
  apps.calculator,
  apps.system,
  apps.settings,
  apps.trash,
]
