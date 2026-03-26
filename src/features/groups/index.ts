// Types

// API
export {
  createGroup,
  deleteGroup,
  listGroups,
  renameGroup,
  reorderGroups,
  setNoteGroup,
} from './api/groups'
export { useGroupCollapse } from './hooks/useGroupCollapse'

// Hooks
export { useGroups } from './hooks/useGroups'
// Pure logic
export {
  bucketByDate,
  formatRelativeDate,
  partitionByGroup,
} from './lib/grouping'
export type { DateBucket, Group, GroupWithNotes } from './lib/types'
