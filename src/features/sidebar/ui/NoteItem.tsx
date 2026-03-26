import {
  FileText,
  Pin,
  PinOff,
  Download,
  Trash2,
  FolderInput,
  Check,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/editor";
import type { Group } from "@/features/groups";
import { formatRelativeDate } from "@/features/groups";

interface NoteItemProps {
  note: Note;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDeleteNote: () => void;
  onExportNote: (noteId: string) => void;
  onMoveToGroup: (noteId: string, groupId: string | null) => void;
  groups: Group[];
  justPinnedId: string | null;
}

/**
 * A single note item in the sidebar with context menu actions.
 *
 * Includes Pin/Unpin, Move to group, Export, and Delete actions.
 */
export function NoteItem({
  note,
  selectedNoteId,
  onSelectNote,
  onTogglePin,
  onDeleteNote,
  onExportNote,
  onMoveToGroup,
  groups,
  justPinnedId,
}: NoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `note-${note.id}`,
      data: { type: "note", noteId: note.id },
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "animate-in fade-in-0 slide-in-from-top-1 duration-200 fill-mode-both py-px",
        isDragging && "opacity-50 z-50",
      )}
    >
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
                {formatRelativeDate(note.updatedAt)}
              </span>
            </div>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => onTogglePin(note.id, !note.isPinned)}
          >
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
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderInput className="h-4 w-4" />
              Move to group
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {groups.map((g) => (
                <ContextMenuItem
                  key={g.id}
                  onClick={() => onMoveToGroup(note.id, g.id)}
                >
                  <span className="flex-1">{g.name}</span>
                  {note.groupId === g.id && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </ContextMenuItem>
              ))}
              {groups.length > 0 && <ContextMenuSeparator />}
              <ContextMenuItem
                onClick={() => onMoveToGroup(note.id, null)}
              >
                <span className="flex-1">Uncategorized</span>
                {note.groupId === null && (
                  <Check className="h-4 w-4 ml-auto" />
                )}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={() => onExportNote(note.id)}>
            <Download className="h-4 w-4" />
            Export as Markdown
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
