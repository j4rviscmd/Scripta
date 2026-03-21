import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { listNotes, type Note } from "@/features/editor";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** Number of milliseconds in one minute. */
const MS_PER_MINUTE = 60_000;
/** Number of milliseconds in one hour. */
const MS_PER_HOUR = 3_600_000;
/** Number of milliseconds in one day. */
const MS_PER_DAY = 86_400_000;

/**
 * Formats an ISO 8601 date string into a human-readable relative time.
 *
 * Returns compact labels such as `"Just now"`, `"5m ago"`, `"3h ago"`,
 * `"2d ago"`, or a locale-formatted absolute date for anything older
 * than seven days.
 *
 * @param iso - An ISO 8601 date string (e.g. `"2026-03-21T12:00:00Z"`).
 * @returns A human-readable relative time string.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / MS_PER_MINUTE);
  const diffHr = Math.floor(diffMs / MS_PER_HOUR);
  const diffDay = Math.floor(diffMs / MS_PER_DAY);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/**
 * Groups notes by relative date for timeline-style display.
 *
 * Notes are bucketed into four fixed groups -- "Today", "Yesterday",
 * "Previous 7 Days", and "Older" -- based on their `updatedAt` value.
 * Groups with zero items are omitted from the result.
 *
 * @param notes - The full list of notes to categorise.
 * @returns An array of label/notes pairs, sorted from newest to oldest.
 */
function groupNotes(notes: Note[]): { label: string; items: Note[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - MS_PER_DAY);
  const weekAgo = new Date(today.getTime() - 7 * MS_PER_DAY);

  const groups: { label: string; items: Note[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const note of notes) {
    const date = new Date(note.updatedAt);
    if (date >= today) groups[0].items.push(note);
    else if (date >= yesterday) groups[1].items.push(note);
    else if (date >= weekAgo) groups[2].items.push(note);
    else groups[3].items.push(note);
  }

  return groups.filter((g) => g.items.length > 0);
}

/**
 * Props for the {@link NoteSidebar} component.
 *
 * @property selectedNoteId - The UUID of the currently active note, or `null` if none is selected.
 * @property onSelectNote - Callback invoked with the chosen note UUID when the user clicks a sidebar item.
 * @property onNewNote - Callback invoked when the user clicks the "new note" button in the sidebar header.
 * @property refreshKey - A numeric counter that triggers a re-fetch of the note list whenever it changes.
 */
interface NoteSidebarProps {
  selectedNoteId: string | null;
  onSelectNote: (noteId: string | null) => void;
  onNewNote: () => void;
  refreshKey: number;
}

/**
 * Sidebar component displaying notes grouped by relative date.
 *
 * Fetches the full note list on mount and whenever `refreshKey` changes,
 * then groups the notes into a timeline layout (Today / Yesterday /
 * Previous 7 Days / Older) via {@link groupNotes}.
 *
 * @param props - {@link NoteSidebarProps}
 */
export function NoteSidebar({
  selectedNoteId,
  onSelectNote,
  onNewNote,
  refreshKey,
}: NoteSidebarProps) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    listNotes().then(setNotes).catch(console.error);
  }, [refreshKey]);

  const groups = groupNotes(notes);

  return (
    <Sidebar>
      <SidebarHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">Scripta</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onNewNote}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {groups.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No notes yet</p>
        ) : (
          groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((note) => (
                    <SidebarMenuItem key={note.id}>
                      <SidebarMenuButton
                        isActive={note.id === selectedNoteId}
                        onClick={() => onSelectNote(note.id)}
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <div className="flex flex-col overflow-hidden">
                          <span className="truncate text-sm">
                            {note.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(note.updatedAt)}
                          </span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>
    </Sidebar>
  );
}
