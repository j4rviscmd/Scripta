import { useMemo, useState } from "react";
import { listNotes, type Note } from "@/features/editor";
import { useEffect } from "react";
import { partitionByGroup } from "@/features/groups";
import type { Group } from "@/features/groups";
import { useDebounce } from "..";

/**
 * Encapsulates note fetching, search filtering, and group partitioning.
 *
 * @param refreshKey - Bumped externally to trigger a re-fetch.
 * @param groups - All groups sorted by display order.
 */
export function useSidebarNotes(refreshKey: number, groups: Group[]) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const debouncedQuery = useDebounce(searchQuery);

  useEffect(() => {
    listNotes().then(setNotes).catch(console.error);
  }, [refreshKey]);

  const filteredNotes = useMemo(() => {
    if (!debouncedQuery.trim()) return notes;
    const q = debouncedQuery.toLowerCase();
    return notes.filter((note) => note.title.toLowerCase().includes(q));
  }, [notes, debouncedQuery]);

  const isSearching = debouncedQuery.trim().length > 0;

  const pinnedNotes = useMemo(
    () => (isSearching ? [] : filteredNotes.filter((n) => n.isPinned)),
    [filteredNotes, isSearching],
  );

  const unpinnedNotes = useMemo(
    () =>
      isSearching
        ? filteredNotes
        : filteredNotes.filter((n) => !n.isPinned),
    [filteredNotes, isSearching],
  );

  const { grouped, uncategorized } = useMemo(
    () => partitionByGroup(unpinnedNotes, groups),
    [unpinnedNotes, groups],
  );

  return {
    searchQuery,
    setSearchQuery,
    isSearching,
    pinnedNotes,
    grouped,
    uncategorized,
    isEmpty: notes.length === 0,
    noResults: isSearching && filteredNotes.length === 0,
    debouncedQuery,
  };
}
