import { useEffect, useMemo, useState } from "react";
import { FileText, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { listNotes, type Note } from "@/features/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useDebounce } from "..";

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
 *
 * @param iso - An ISO 8601 date string (e.g. `"2026-03-21T12:00:00Z"`).
 * @returns A human-readable relative time string.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < MINUTES_PER_HOUR) return `${diffMin}m ago`;
  if (diffMin < MINUTES_PER_DAY) return `${Math.floor(diffMin / MINUTES_PER_HOUR)}h ago`;
  if (diffMin < MINUTES_PER_WEEK) return `${Math.floor(diffMin / MINUTES_PER_DAY)}d ago`;
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

  const groups: { label: string; items: Note[] }[] = [
    { label: "Today", items: todayItems },
    { label: "Yesterday", items: yesterdayItems },
    { label: "Previous 7 Days", items: weekItems },
    { label: "Older", items: olderItems },
  ];

  return groups.filter((g) => g.items.length > 0);
}

/**
 * Props for the {@link NoteItem} component.
 */
interface NoteItemProps {
  note: Note;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDeleteNote: () => void;
  justPinnedId: string | null;
}

/**
 * A single note item in the sidebar, used in both pinned and date groups.
 */
function NoteItem({
  note,
  selectedNoteId,
  onSelectNote,
  onTogglePin,
  onDeleteNote,
  justPinnedId,
}: NoteItemProps) {
  return (
    <SidebarMenuItem className="animate-in fade-in-0 slide-in-from-top-1 duration-200 fill-mode-both py-px">
      <ContextMenu>
        <ContextMenuTrigger>
          <SidebarMenuButton
            isActive={note.id === selectedNoteId}
            onClick={() => onSelectNote(note.id)}
            className={cn(note.isPinned && "hover:bg-primary/5")}
          >
            {note.isPinned ? (
              <Pin
                className={cn(
                  "h-4 w-4 shrink-0 text-primary fill-primary/20",
                  justPinnedId === note.id && "animate-pin-bounce",
                )}
              />
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm">{note.title}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(note.updatedAt)}
              </span>
            </div>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onTogglePin(note.id, !note.isPinned)}>
            {note.isPinned ? (
              <>
                <PinOff className="h-4 w-4" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="h-4 w-4" />
                Pin to top
              </>
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onDeleteNote}>
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
}

/**
 * Props for the {@link NoteSidebar} component.
 *
 * @property selectedNoteId - The UUID of the currently active note, or `null` if none is selected.
 * @property onSelectNote - Callback invoked with the chosen note UUID when the user clicks a sidebar item.
 * @property onNewNote - Callback invoked when the user clicks the "new note" button in the sidebar header.
 * @property onDeleteNote - Callback invoked with the note UUID when the user confirms deletion via the context menu.
 * @property onTogglePin - Callback invoked with the note UUID and new pinned state when the user toggles pin.
 * @property refreshKey - A numeric counter that triggers a re-fetch of the note list whenever it changes.
 */
interface NoteSidebarProps {
  selectedNoteId: string | null;
  onSelectNote: (noteId: string | null) => void;
  onNewNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onTogglePin: (noteId: string, pinned: boolean) => void;
  refreshKey: number;
}

/**
 * Sidebar component displaying notes with pinned section and date grouping.
 *
 * Fetches the full note list on mount and whenever `refreshKey` changes,
 * then separates pinned notes (displayed at the top) from unpinned notes
 * (grouped by relative date via {@link groupNotes}).
 *
 * A search input in the header allows filtering notes by title in
 * real-time with a 300 ms debounce.
 *
 * @param props - {@link NoteSidebarProps}
 */
export function NoteSidebar({
  selectedNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onTogglePin,
  refreshKey,
}: NoteSidebarProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [justPinnedId, setJustPinnedId] = useState<string | null>(null);

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

  const handleTogglePin = (noteId: string, pinned: boolean) => {
    onTogglePin(noteId, pinned);
    if (pinned) {
      setJustPinnedId(noteId);
      setTimeout(() => setJustPinnedId(null), 400);
    }
  };

  function renderSidebarBody(): React.ReactNode {
    if (isSearching && filteredNotes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Search className="h-8 w-8" />
          <p className="text-xs">No notes match &quot;{debouncedQuery}&quot;</p>
        </div>
      );
    }

    // During search: hide pinned section, show all results in date groups
    const pinnedNotes = isSearching ? [] : filteredNotes.filter((n) => n.isPinned);
    const unpinnedNotes = isSearching
      ? filteredNotes
      : filteredNotes.filter((n) => !n.isPinned);
    const groups = groupNotes(unpinnedNotes);

    if (pinnedNotes.length === 0 && groups.length === 0) {
      return <p className="p-4 text-sm text-muted-foreground">No notes yet</p>;
    }

    return (
      <>
        {/* Pinned section */}
        {pinnedNotes.length > 0 && (
          <>
            <SidebarGroup className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
              <SidebarGroupLabel className="flex items-center gap-1 text-[10px] [&>svg]:!size-2.5">
                <Pin className="fill-primary text-primary" />
                Pinned
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pinnedNotes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      selectedNoteId={selectedNoteId}
                      onSelectNote={onSelectNote}
                      onTogglePin={handleTogglePin}
                      onDeleteNote={() => setDeleteTarget(note.id)}
                      justPinnedId={justPinnedId}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator className="mx-3 animate-in fade-in-0 duration-500 delay-150" />
          </>
        )}

        {/* Date groups */}
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    selectedNoteId={selectedNoteId}
                    onSelectNote={onSelectNote}
                    onTogglePin={handleTogglePin}
                    onDeleteNote={() => setDeleteTarget(note.id)}
                    justPinnedId={justPinnedId}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="flex flex-row items-center gap-2 border-b px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="h-8 pl-8 pr-8 text-sm bg-muted/50 border-transparent focus:border-border focus:bg-background"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onNewNote}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </SidebarHeader>
      <SidebarContent>{renderSidebarBody()}</SidebarContent>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) onDeleteNote(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
