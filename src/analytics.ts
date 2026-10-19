import { useEffect, useRef } from 'react'
import posthog, { isPostHogConfigured } from './posthog.ts'
import type { SnapSide, SnapZone } from './shells/desktop/snap.ts'
import type { AppId } from './system/apps.ts'

// Every custom event the site sends, in one place. Names are snake_case and,
// like every property value, always in English, whatever language the visitor uses.

/** Where an app was launched from. */
export type AppSource =
  | 'first_visit'
  | 'app_menu'
  | 'desktop_icon'
  | 'desktop_menu'
  | 'panel'
  | 'home_screen'
  | 'dock'
  | 'about'
  | 'files'
  | 'terminal'

/** Where a preference was changed. */
export type SettingsSource = 'panel' | 'settings' | 'terminal'

/** Where a contact detail was reached. */
export type ContactSource = 'contact_app' | 'about' | 'resume'

/** Where the visitor created or deleted a file or folder: the desktop, or the app that did it. */
export type FileSource = 'desktop' | 'files' | 'terminal' | 'editor' | (string & {})

/** The kind of file, as the analytics have always named it (see legacyFileType in system/fs.ts). */
export type FileType = 'resume' | 'markdown' | 'image' | 'link' | 'text' | 'shortcut'

type None = Record<never, never>

export interface AnalyticsEvents {
  // System
  boot_skipped: { method: 'keyboard' | 'pointer' }
  portfolio_entered: { entry_point: 'desktop_login' | 'mobile_lock_screen' }
  session_logged_out: { open_windows: number }
  classic_version_opened: { source: 'login' | 'app_menu' | 'about' | 'settings' }
  source_code_opened: { source: 'settings' }
  theme_changed: { theme: 'light' | 'dark'; source: SettingsSource }
  language_changed: { language: 'pt' | 'en'; source: SettingsSource }
  wallpaper_changed: { wallpaper: string; source: SettingsSource }
  fullscreen_toggled: { fullscreen: boolean }

  // Apps and windows
  app_opened: { app: AppId; source: AppSource; path?: string; url?: string; already_open?: boolean }
  app_closed: { app: AppId; method: 'window' | 'back' | 'home' }
  app_menu_opened: { trigger: 'panel_button' | 'super_key' }
  app_menu_searched: { query: string; results: number; selected_app: AppId }
  window_minimized: { app: AppId }
  window_restored: { app: AppId }
  taskbar_item_clicked: { app: AppId; action: 'activate' | 'minimize' }
  window_switcher_used: { app: AppId; open_windows: number }
  window_snapped: { app: AppId; zone: SnapZone }
  snap_assist_used: { app: AppId; side: SnapSide; candidates: number }
  desktop_icons_moved: { icons: number }

  // Calendar (the clock's flyout on the desktop, an app on the phone)
  calendar_opened: None
  calendar_navigated: {
    direction: 'previous' | 'next' | 'today'
    method: 'button' | 'wheel' | 'swipe'
    shell: 'desktop' | 'mobile'
  }

  // Contact
  contact_details_viewed: { source: 'contact_app' | 'terminal' }
  contact_email_clicked: { source: ContactSource }
  contact_email_copied: { source: ContactSource }
  contact_profile_clicked: { network: string; source: ContactSource }
  contact_form_started: None
  contact_form_submitted: { message_length: number }

  // About me
  portfolio_cta_selected: { destination: 'resume' | 'projects' | 'contact' }

  // Files and Viewer
  folder_opened: { path: string; method: 'item' | 'back' | 'up' | 'breadcrumb' | 'sidebar' | 'address_bar' }
  file_opened: { path: string; file_type: FileType; mime: string; source: AppSource }
  /** Opened with an app other than the default, from "Open with". */
  file_opened_with: { app: AppId; mime: string }
  project_resource_opened: { project: string; resource: string; resource_type: FileType | 'project' }
  resume_viewed: { format: 'pdf' | 'page' }
  file_downloaded: { file: string; file_type: FileType; export_method: 'download' | 'print' }
  external_link_clicked: { url: string; source: 'markdown' }

  // The visitor's own files: never their names or what they wrote (paths go through publicPath).
  file_created: { kind: 'file' | 'folder' | 'symlink'; source: FileSource }
  file_renamed: { kind: 'file' | 'folder' | 'symlink' }
  file_moved: { items: number; source: FileSource }
  file_saved: { characters: number }
  file_deleted: { items: number; permanent: boolean; source: FileSource }
  file_restored: { items: number }
  trash_emptied: { items: number }
  /** Once per visitor whose files were moved from the first version's storage. */
  fs_migrated: { from: string }

  // Browser
  browser_navigated: { host: string; method: 'address_bar' | 'bookmark' | 'home_tile'; framed: boolean }
  browser_toolbar_used: { action: 'back' | 'forward' | 'reload' | 'home' }
  browser_tab_opened: { tabs: number }
  browser_tab_closed: { tabs: number }
  browser_external_link_opened: { host: string; source: 'toolbar' | 'blocked_page' }

  // Terminal
  terminal_command_run: { command: string; known: boolean }
  process_killed: { app: AppId }

  // Gallery
  gallery_photo_opened: { photo: string; album: string }
  gallery_photo_navigated: { direction: 'previous' | 'next'; method: 'button' | 'keyboard' }

  // Calculator
  calculator_calculation_performed: { operator: 'add' | 'subtract' | 'multiply' | 'divide' }
}

export type AnalyticsEvent = keyof AnalyticsEvents

type Properties<E extends AnalyticsEvent> = None extends AnalyticsEvents[E]
  ? [properties?: AnalyticsEvents[E]]
  : [properties: AnalyticsEvents[E]]

/** Sends an event. Does nothing when PostHog isn't configured. */
export function track<E extends AnalyticsEvent>(event: E, ...[properties]: Properties<E>) {
  if (isPostHogConfigured) posthog.capture(event, properties)
}

/** Properties attached to every event from now on (shell, theme, language...). */
export function setContext(properties: Record<string, string>) {
  if (isPostHogConfigured) posthog.register(properties)
}

/** Sends an event when the component appears: once, even with StrictMode's repeated effects. */
export function useTrackView<E extends AnalyticsEvent>(event: E, ...properties: Properties<E>) {
  const sent = useRef(false)
  const latest = useRef(properties)

  useEffect(() => {
    latest.current = properties
  })

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    track(event, ...latest.current)
  }, [event])
}
