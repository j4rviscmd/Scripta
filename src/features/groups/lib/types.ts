import type { Note } from '@/features/editor'

/**
 * A note group persisted in the SQLite database.
 *
 * Groups organise notes into collapsible sidebar sections.
 * Each note may belong to at most one group.
 */
export interface Group {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** A date-bucketed collection of notes (e.g. "Today", "Yesterday"). */
export interface DateBucket {
  label: string
  items: Note[]
}

/** A group together with its notes organised by date. */
export interface GroupWithNotes {
  group: Group
  dateBuckets: DateBucket[]
  noteCount: number
}
