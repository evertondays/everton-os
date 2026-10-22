import { track } from '../../analytics.ts'
import { type Entry, PROJECTS_PATH, isOwn, legacyFileType } from '../../sdk/index.ts'

/**
 * Reports `entry` being opened when it's one of the résumé's own projects or
 * their files: what visitors make in there is theirs, and so are its names.
 * `chain` is the folder it's in, from the root.
 */
export function trackProjectResource(entry: Entry, chain: Entry[]) {
  if (!entry.path.startsWith(`${PROJECTS_PATH}/`) || isOwn(entry) || chain.some(isOwn)) return
  track('project_resource_opened', {
    project: entry.path.split('/')[2],
    resource: entry.name,
    resource_type: entry.inode.kind === 'dir' ? 'project' : legacyFileType(entry.mime),
  })
}
