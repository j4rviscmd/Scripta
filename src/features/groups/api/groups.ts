import { invoke } from '@tauri-apps/api/core'
import type { Note } from '@/features/editor'
import type { Group } from '../lib/types'

/**
 * Returns all groups sorted by their display order.
 */
export async function listGroups(): Promise<Group[]> {
  return invoke<Group[]>('list_groups')
}

/**
 * Creates a new group with the given display name.
 *
 * @param name - The display name for the new group.
 * @returns The newly created group.
 */
export async function createGroup(name: string): Promise<Group> {
  return invoke<Group>('create_group', { name })
}

/**
 * Renames an existing group.
 *
 * @param id - The UUID of the group to rename.
 * @param name - The new display name.
 * @returns The updated group.
 */
export async function renameGroup(id: string, name: string): Promise<Group> {
  return invoke<Group>('rename_group', { id, name })
}

/**
 * Permanently deletes a group.
 *
 * Notes belonging to the deleted group are automatically moved to
 * "Uncategorized" via the ON DELETE SET NULL constraint.
 *
 * @param id - The UUID of the group to delete.
 */
export async function deleteGroup(id: string): Promise<void> {
  return invoke<void>('delete_group', { id })
}

/**
 * Updates the display order of all groups.
 *
 * @param ids - Ordered list of group UUIDs representing the desired order.
 */
export async function reorderGroups(ids: string[]): Promise<void> {
  return invoke<void>('reorder_groups', { ids })
}

/**
 * Moves a note to a different group, or removes it from any group.
 *
 * @param noteId - The UUID of the note to move.
 * @param groupId - The target group UUID, or `null` for uncategorized.
 * @returns The updated note.
 */
export async function setNoteGroup(
  noteId: string,
  groupId: string | null
): Promise<Note> {
  return invoke<Note>('set_note_group', { noteId, groupId })
}
