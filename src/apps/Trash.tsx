import { TRASH_PATH } from '../system/fs.ts'
import Files from './Files.tsx'

/** The Trash is the Files app looking at the hidden trash folder. */
export default function TrashApp() {
  return <Files args={{ path: TRASH_PATH }} />
}
