// Types
export type { Group, DateBucket, GroupWithNotes } from "./lib/types";

// API
export {
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
  setNoteGroup,
} from "./api/groups";

// Hooks
export { useGroups } from "./hooks/useGroups";
export { useGroupCollapse } from "./hooks/useGroupCollapse";

// Pure logic
export {
  bucketByDate,
  partitionByGroup,
  formatRelativeDate,
} from "./lib/grouping";
