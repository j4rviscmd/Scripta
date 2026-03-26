import { useCallback, useEffect, useState } from "react";
import type { Group } from "../lib/types";
import {
  listGroups,
  createGroup as apiCreateGroup,
  renameGroup as apiRenameGroup,
  deleteGroup as apiDeleteGroup,
  reorderGroups as apiReorderGroups,
  setNoteGroup as apiSetNoteGroup,
} from "../api/groups";
import type { Note } from "@/features/editor";

/**
 * Manages group CRUD operations and state.
 *
 * Fetches groups whenever `refreshKey` changes and exposes mutation
 * functions that delegate to the Tauri backend.
 *
 * @param refreshKey - Bumped externally to trigger a re-fetch.
 * @param onRefresh - Called after any mutation so the parent can bump its own refresh counter.
 */
export function useGroups(refreshKey: number, onRefresh: () => void) {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    listGroups().then(setGroups).catch(console.error);
  }, [refreshKey]);

  const create = useCallback(
    async (name: string): Promise<Group> => {
      const group = await apiCreateGroup(name);
      onRefresh();
      return group;
    },
    [onRefresh],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<void> => {
      await apiRenameGroup(id, name);
      onRefresh();
    },
    [onRefresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await apiDeleteGroup(id);
      onRefresh();
    },
    [onRefresh],
  );

  const reorder = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      // Optimistic update
      setGroups((prev) => {
        const map = new Map(prev.map((g) => [g.id, g]));
        return orderedIds
          .map((id) => map.get(id))
          .filter((g): g is Group => g !== undefined);
      });
      await apiReorderGroups(orderedIds);
    },
    [],
  );

  const moveNote = useCallback(
    async (noteId: string, groupId: string | null): Promise<Note> => {
      const note = await apiSetNoteGroup(noteId, groupId);
      onRefresh();
      return note;
    },
    [onRefresh],
  );

  return { groups, create, rename, remove, reorder, moveNote };
}
