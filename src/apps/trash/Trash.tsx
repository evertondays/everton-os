import { TRASH_PATH } from '../../sdk/index.ts'
import Files from '../files/Files.tsx'

/** The Trash is Files, opened at the Trash. */
export default function Trash() {
  return <Files args={{ files: [TRASH_PATH] }} />
}
