import { useCallback, useEffect, useState } from 'react'
import type { Note } from '@/features/editor'
import {
  createGroup as apiCreateGroup,
  deleteGroup as apiDeleteGroup,
  renameGroup as apiRenameGroup,
  reorderGroups as apiReorderGroups,
  setNoteGroup as apiSetNoteGroup,
  listGroups,
} from '../api/groups'
import type { Group } from '../lib/types'

/**
 * Manages group CRUD operations and state.
 *
 * Fetches groups whenever `refreshKey` changes and exposes mutation
 * functions that delegate to the Tauri backend.
 *
 * @param refreshKey - Bumped externally to trigger a re-fetch.
 * @param onRefresh - Called after any mutation so the parent can bump its own refresh counter.
 * @returns An object containing:
 *   - `groups` – The current list of groups.
 *   - `create` – Creates a new group with the given name.
 *   - `rename` – Renames an existing group by id.
 *   - `remove` – Deletes a group by id.
 *   - `reorder` – Reorders groups with an optimistic local update.
 *   - `moveNote` – Assigns or unassigns a note to/from a group.
 */
export function useGroups(refreshKey: number, onRefresh: () => void) {
  const [groups, setGroups] = useState<Group[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional trigger to re-fetch
  useEffect(() => {
    listGroups().then(setGroups).catch(console.error)
  }, [refreshKey])

  const create = useCallback(
    async (name: string): Promise<Group> => {
      const group = await apiCreateGroup(name)
      onRefresh()
      return group
    },
    [onRefresh]
  )

  const rename = useCallback(
    async (id: string, name: string): Promise<void> => {
      await apiRenameGroup(id, name)
      onRefresh()
    },
    [onRefresh]
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await apiDeleteGroup(id)
      onRefresh()
    },
    [onRefresh]
  )

  const reorder = useCallback(async (orderedIds: string[]): Promise<void> => {
    // Optimistic update: reorder the local state immediately so the UI
    // reflects the new order before the backend call completes.
    setGroups((prev) => {
      const map = new Map(prev.map((g) => [g.id, g]))
      return orderedIds
        .map((id) => map.get(id))
        .filter((g): g is Group => g !== undefined)
    })
    await apiReorderGroups(orderedIds)
  }, [])

  const moveNote = useCallback(
    async (noteId: string, groupId: string | null): Promise<Note> => {
      const note = await apiSetNoteGroup(noteId, groupId)
      onRefresh()
      return note
    },
    [onRefresh]
  )

  return { groups, create, rename, remove, reorder, moveNote }
}
