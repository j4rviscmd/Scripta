import { useDraggable } from '@dnd-kit/core'
import {
  Check,
  Download,
  FileText,
  FolderInput,
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

interface NoteItemProps {
  note: Note
  selectedNoteId: string | null
  onSelectNote: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDeleteNote: () => void
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
  onDeleteNote,
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
            {note.isPinned ? (
              <Pin
                className={cn(
                  'h-4 w-4 shrink-0 fill-primary/20 text-primary',
                  justPinnedId === note.id && 'animate-pin-bounce'
                )}
              />
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm">{note.title}</span>
              <span className="text-muted-foreground text-xs">
                {formatRelativeDate(note.updatedAt)}
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
