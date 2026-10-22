import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { Locale } from '../data/localize.ts'

// What an app is: a folder in src/apps/ with a manifest.ts (this) and its
// component. The system finds the manifests on its own (system/apps.ts), so
// creating the folder is all it takes to install an app.
// This file has no imports from the system, so manifests can load first.

export type Shell = 'desktop' | 'mobile'

/** What an app is opened with. */
export interface LaunchArgs {
  /** Words typed after its name in the Terminal. */
  argv?: string[]
  /** Files (or folders) to open. */
  files?: string[]
  /** Address to load. */
  url?: string
}

export interface AppProps {
  args: LaunchArgs
}

export interface AppManifest {
  id: string
  name: Record<Locale, string>
  icon: LucideIcon
  /** Gradient of the icon tile. */
  tint: [string, string]
  /** Default window size on the desktop. */
  window?: { width: number; height: number }
  /** Only one instance at a time: opening it again hands the new arguments to the one there is (useLaunchArgs). */
  single?: boolean
  /** Only offered in these shells; all of them when left out. */
  shells?: Shell[]
  /** Place in the desktop's menu and on the phone's home screen. */
  order?: number
  /** What it opens: file types (`text/markdown`, `text/*`) and URL schemes (`https`). */
  handles?: { mime?: string[]; schemes?: string[] }
  /** False keeps it out of the menu and the home screen. */
  listed?: boolean
  /** The component, loaded on demand: import it here, never at the top of the manifest. */
  entry: () => Promise<{ default: ComponentType<AppProps> }>
  /**
   * The phone edition, where it differs: usually a component of its own (a
   * phone app isn't a small window), sometimes a name and icon too. Same id,
   * so everything that opens the app opens this edition on the phone.
   */
  mobile?: Partial<Pick<AppManifest, 'name' | 'icon' | 'tint' | 'entry'>>
}

export const defineApp = (manifest: AppManifest) => manifest
