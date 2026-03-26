import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronRight,
  Folder,
  GripVertical,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/ui/sidebar'
import type { Note } from '@/features/editor'
import type { GroupWithNotes } from '@/features/groups'
import { cn } from '@/lib/utils'
import { DateGroup } from './DateGroup'

interface GroupSectionProps {
  groupWithNotes: GroupWithNotes
  isCollapsed: boolean
  onToggleCollapse: () => void
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  renderNoteItem: (note: Note) => React.ReactNode
}

/**
 * A collapsible, sortable, droppable group section in the sidebar.
 *
 * Supports drag-and-drop for reordering groups and for receiving
 * notes dropped onto the group header. Right-click for rename/delete.
 */
export function GroupSection({
  groupWithNotes,
  isCollapsed,
  onToggleCollapse,
  onRename,
  onDelete,
  renderNoteItem,
}: GroupSectionProps) {
  const { group, dateBuckets, noteCount } = groupWithNotes
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(group.name)
  const composingRef = useRef(false)

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.id,
    data: { type: 'group' },
  })

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `drop-${group.id}`,
    data: { type: 'group', groupId: group.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    setTimeout(() => {
      composingRef.current = false
    }, 50)
  }, [])

  const commitRename = useCallback(async () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== group.name) {
      await onRename(group.id, trimmed)
    }
    setIsEditing(false)
  }, [editName, group.id, group.name, onRename])

  const startEditing = useCallback(() => {
    setEditName(group.name)
    setIsEditing(true)
  }, [group.name])

  return (
    <SidebarGroup
      ref={setSortableRef}
      style={style}
      className={cn('overflow-hidden', isDragging && 'opacity-50')}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <SidebarGroupLabel
            ref={setDroppableRef}
            className={cn(
              'cursor-pointer select-none overflow-hidden rounded-md transition-colors hover:bg-sidebar-accent/50',
              isOver && 'bg-primary/10 ring-1 ring-primary/30'
            )}
            onClick={onToggleCollapse}
          >
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !composingRef.current) {
                    e.preventDefault()
                    commitRename()
                  }
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                className="h-5 px-1 text-xs"
                autoFocus
              />
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <span
                    className="cursor-grab touch-none active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  </span>
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform duration-200',
                      !isCollapsed && 'rotate-90'
                    )}
                  />
                  <Folder className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{group.name}</span>
                </div>
                {noteCount > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {noteCount}
                  </span>
                )}
              </>
            )}
          </SidebarGroupLabel>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={startEditing}>
            <Pencil className="h-4 w-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => onDelete(group.id)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!isCollapsed && (
        <SidebarGroupContent>
          {dateBuckets.map((bucket) => (
            <DateGroup
              key={bucket.label}
              bucket={bucket}
              renderNoteItem={renderNoteItem}
            />
          ))}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
