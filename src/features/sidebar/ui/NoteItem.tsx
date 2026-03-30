import { useDraggable } from '@dnd-kit/core'
import {
  Check,
  Copy,
  Download,
  FileLock,
  FileText,
  FolderInput,
  LockOpen,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Note } from '@/features/editor'
import type { Group } from '@/features/groups'
import { formatRelativeDate } from '@/features/groups'
import { cn } from '@/lib/utils'

/**
 * Props for the {@link NoteItem} component.
 *
 * @property note - The note object to render.
 * @property selectedNoteId - The ID of the currently selected note, or `null`.
 * @property onSelectNote - Callback invoked when the user clicks this note.
 * @property onTogglePin - Callback to pin or unpin the note.
 * @property onToggleLock - Callback to lock or unlock the note.
 * @property onDeleteNote - Callback invoked when the user confirms deletion.
 * @property onDuplicateNote - Callback invoked to duplicate the note.
 * @property onExportNote - Callback invoked to export the note as Markdown.
 * @property onMoveToGroup - Callback invoked to move the note to a different group.
 * @property groups - The full list of groups available for the "Move to group" submenu.
 * @property justPinnedId - The ID of the note that was just pinned (for bounce animation), or `null`.
 */
interface NoteItemProps {
  note: Note
  selectedNoteId: string | null
  onSelectNote: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onToggleLock: (id: string, locked: boolean) => void
  onDeleteNote: () => void
  onDuplicateNote: (noteId: string) => void
  onExportNote: (noteId: string) => void
  onMoveToGroup: (noteId: string, groupId: string | null) => void
  groups: Group[]
  justPinnedId: string | null
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
  onToggleLock,
  onDeleteNote,
  onDuplicateNote,
  onExportNote,
  onMoveToGroup,
  groups,
  justPinnedId,
}: NoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `note-${note.id}`,
      data: { type: 'note', noteId: note.id },
    })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  let noteIcon: React.ReactNode
  if (note.isPinned) {
    noteIcon = (
      <Pin
        className={cn(
          'h-4 w-4 shrink-0 fill-primary/20 text-primary',
          justPinnedId === note.id && 'animate-pin-bounce'
        )}
      />
    )
  } else if (note.isLocked) {
    noteIcon = <FileLock className="h-4 w-4 shrink-0" />
  } else {
    noteIcon = <FileText className="h-4 w-4 shrink-0" />
  }

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'fade-in-0 slide-in-from-top-1 animate-in fill-mode-both py-px duration-200',
        isDragging && 'z-50 opacity-50'
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <SidebarMenuButton
            isActive={note.id === selectedNoteId}
            onClick={() => onSelectNote(note.id)}
            className={cn(note.isPinned && 'hover:bg-primary/5')}
          >
            {noteIcon}
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm">{note.title}</span>
              <span className="text-[0.65rem] text-muted-foreground/60">
                {formatRelativeDate(note.updatedAt)}
              </span>
            </div>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onTogglePin(note.id, !note.isPinned)}>
            {note.isPinned ? (
              <PinOff className="h-4 w-4" />
            ) : (
              <Pin className="h-4 w-4" />
            )}
            {note.isPinned ? 'Unpin' : 'Pin to top'}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onToggleLock(note.id, !note.isLocked)}
          >
            {note.isLocked ? (
              <LockOpen className="h-4 w-4" />
            ) : (
              <FileLock className="h-4 w-4" />
            )}
            {note.isLocked ? 'Unlock' : 'Lock'}
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
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </ContextMenuItem>
              ))}
              {groups.length > 0 && <ContextMenuSeparator />}
              <ContextMenuItem onClick={() => onMoveToGroup(note.id, null)}>
                <span className="flex-1">Uncategorized</span>
                {note.groupId === null && <Check className="ml-auto h-4 w-4" />}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={() => onExportNote(note.id)}>
            <Download className="h-4 w-4" />
            Export as Markdown
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDuplicateNote(note.id)}>
            <Copy className="h-4 w-4" />
            Duplicate
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onDeleteNote}>
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  )
}
