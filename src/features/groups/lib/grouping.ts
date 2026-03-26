import type { Note } from "@/features/editor";
import type { DateBucket, Group, GroupWithNotes } from "./types";

const MS_PER_DAY = 86_400_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1_440;
const MINUTES_PER_WEEK = 10_080;

/**
 * Formats an ISO 8601 date string into a human-readable relative time.
 *
 * Returns compact labels such as `"Just now"`, `"5m ago"`, `"3h ago"`,
 * `"2d ago"`, or a locale-formatted absolute date for anything older
 * than seven days.
 */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < MINUTES_PER_HOUR) return `${diffMin}m ago`;
  if (diffMin < MINUTES_PER_DAY)
    return `${Math.floor(diffMin / MINUTES_PER_HOUR)}h ago`;
  if (diffMin < MINUTES_PER_WEEK)
    return `${Math.floor(diffMin / MINUTES_PER_DAY)}d ago`;
  return date.toLocaleDateString();
}

/**
 * Buckets notes into date groups: Today, Yesterday, Previous 7 Days, Older.
 *
 * Groups with zero items are omitted from the result.
 */
export function bucketByDate(notes: Note[]): DateBucket[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - MS_PER_DAY);
  const weekAgo = new Date(today.getTime() - 7 * MS_PER_DAY);

  const todayItems: Note[] = [];
  const yesterdayItems: Note[] = [];
  const weekItems: Note[] = [];
  const olderItems: Note[] = [];

  for (const note of notes) {
    const date = new Date(note.updatedAt);
    if (date >= today) {
      todayItems.push(note);
    } else if (date >= yesterday) {
      yesterdayItems.push(note);
    } else if (date >= weekAgo) {
      weekItems.push(note);
    } else {
      olderItems.push(note);
    }
  }

  const groups: DateBucket[] = [
    { label: "Today", items: todayItems },
    { label: "Yesterday", items: yesterdayItems },
    { label: "Previous 7 Days", items: weekItems },
    { label: "Older", items: olderItems },
  ];

  return groups.filter((g) => g.items.length > 0);
}

/**
 * Partitions notes into their assigned groups and an uncategorized bucket.
 *
 * Each group's notes are further sub-grouped by date via {@link bucketByDate}.
 * Pinned notes should be filtered out before calling this function.
 *
 * @param notes - Unpinned notes to partition.
 * @param groups - All groups sorted by `sortOrder`.
 * @returns Groups with date-bucketed notes, and uncategorized date buckets.
 */
export function partitionByGroup(
  notes: Note[],
  groups: Group[],
): { grouped: GroupWithNotes[]; uncategorized: DateBucket[] } {
  const byGroupId = new Map<string, Note[]>();

  for (const group of groups) {
    byGroupId.set(group.id, []);
  }

  const uncategorizedNotes: Note[] = [];

  for (const note of notes) {
    if (note.groupId && byGroupId.has(note.groupId)) {
      byGroupId.get(note.groupId)!.push(note);
    } else {
      uncategorizedNotes.push(note);
    }
  }

  const grouped: GroupWithNotes[] = groups.map((group) => {
    const groupNotes = byGroupId.get(group.id) ?? [];
    return {
      group,
      dateBuckets: bucketByDate(groupNotes),
      noteCount: groupNotes.length,
    };
  });

  return {
    grouped,
    uncategorized: bucketByDate(uncategorizedNotes),
  };
}
