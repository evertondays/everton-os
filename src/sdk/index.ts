// The public API of the system: the only place apps import system things
// from (a lint rule keeps it that way). Besides this, apps may use
// src/components, src/data, src/i18n and analytics.

export { type AppManifest, type AppProps, type LaunchArgs, type Shell, defineApp } from './app.ts'

// Running in the system
export {
  type AppInfo,
  type AppWindow,
  type CloseGuard,
  type OS,
  useAppWindow,
  useFileContent,
  useLaunchArgs,
  useObjectUrl,
  useOS,
} from '../system/os.ts'
export type { Pid, Process } from '../system/processes.ts'

// Files
export { PROJECTS_PATH, RESUME_PATH, legacyFileType, publicPath, useFsVersion, useTrashFull } from '../system/fs.ts'
export {
  DESKTOP_PATH,
  type Entry,
  MAX_FILE_LENGTH,
  TRASH_INFO_PATH,
  TRASH_PATH,
  isInTrash,
} from '../system/vfs/vfs.ts'
export type { Content, Inode } from '../system/vfs/types.ts'
export { VfsError } from '../system/vfs/errors.ts'
export { DIRECTORY_MIME, LAUNCHER_MIME, SYMLINK_MIME, URL_MIME, mimeOf } from '../system/vfs/mime.ts'
export { basename, dirname, isInside, joinPath, splitPath } from '../system/vfs/path.ts'
export {
  DROP_FOLDER_ATTRIBUTE,
  FILE_DRAG_TYPE,
  usePointerDropFolder,
  type Tile,
  canModify,
  draggedPaths,
  fsErrorMessage,
  isFileDrag,
  isOwn,
  tileFor,
  tiles,
} from '../system/fileUi.ts'

// Preferences, language and time
export { useLocale, useT, type Translate } from '../i18n/index.ts'
export { type Theme, setLocale, setTheme, setWallpaper, useSettings } from '../system/settings.ts'
export { useWallpaper, wallpapers } from '../system/wallpapers.ts'
export { useResume } from '../data/resume.ts'
export { assetUrl, classicUrl } from '../system/media.ts'
export { formatDate, formatMonth, formatPeriod, formatTime } from '../system/format.ts'
export {
  type Month,
  addMonths,
  fullDate,
  isoWeek,
  monthGrid,
  monthOf,
  monthTitle,
  relativeDay,
  sameDay,
  sameMonth,
  weekdayNames,
} from '../system/calendar.ts'
export { useClock } from '../system/useClock.ts'
