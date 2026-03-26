import { useEffect, useMemo, useState } from 'react'
import { listNotes, type Note } from '@/features/editor'
import type { Group } from '@/features/groups'
import { partitionByGroup } from '@/features/groups'
import { useDebounce } from '..'

/**
 * Encapsulates note fetching, search filtering, and group partitioning.
 *
 * Notes are fetched whenever `refreshKey` changes.  The resulting list is
 * filtered by a debounced search query and then split into pinned,
 * grouped (by the supplied groups), and uncategorized buckets.
 *
 * When a search is active, pinned notes are excluded from results so that
 * all matches appear in a single flat list.
 *
 * @param refreshKey - Bumped externally to trigger a re-fetch.
 * @param groups - All groups sorted by display order.
 * @returns An object containing:
 *   - `searchQuery` – The raw (non-debounced) search input value.
 *   - `setSearchQuery` – Setter for `searchQuery`.
 *   - `isSearching` – Whether a non-empty search query is active.
 *   - `pinnedNotes` – Pinned notes (empty while searching).
 *   - `grouped` – Unpinned notes partitioned into their respective groups.
 *   - `uncategorized` – Unpinned notes that don't belong to any group.
 *   - `isEmpty` – `true` when no notes exist at all.
 *   - `noResults` – `true` when a search is active but yields no matches.
 *   - `debouncedQuery` – The debounced search query string.
 */
export function useSidebarNotes(refreshKey: number, groups: Group[]) {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const debouncedQuery = useDebounce(searchQuery)

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional trigger to re-fetch
  useEffect(() => {
    listNotes().then(setNotes).catch(console.error)
  }, [refreshKey])

  /** Notes filtered by the debounced search query (case-insensitive title match). */
  const filteredNotes = useMemo(() => {
    if (!debouncedQuery.trim()) return notes
    const q = debouncedQuery.toLowerCase()
    return notes.filter((note) => note.title.toLowerCase().includes(q))
  }, [notes, debouncedQuery])

  const isSearching = debouncedQuery.trim().length > 0

  // While searching, pinned notes are merged into the main results so that
  // every match is visible in a single flat list.
  const pinnedNotes = useMemo(
    () => (isSearching ? [] : filteredNotes.filter((n) => n.isPinned)),
    [filteredNotes, isSearching]
  )

  const unpinnedNotes = useMemo(
    () =>
      isSearching ? filteredNotes : filteredNotes.filter((n) => !n.isPinned),
    [filteredNotes, isSearching]
  )

  /** Unpinned notes split into per-group buckets and an uncategorized list. */
  const { grouped, uncategorized } = useMemo(
    () => partitionByGroup(unpinnedNotes, groups),
    [unpinnedNotes, groups]
  )

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
  }
}
