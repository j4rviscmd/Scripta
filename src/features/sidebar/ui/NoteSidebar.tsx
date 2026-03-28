import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { FolderCog, Search, Settings, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import type { Note } from '@/features/editor'
import { bucketByDate, useGroupCollapse, useGroups } from '@/features/groups'
import { SettingsDialog } from '@/features/settings'
import { useSidebarNotes } from '../hooks/useSidebarNotes'
import { DateGroup } from './DateGroup'
import { DeleteNoteDialog } from './DeleteNoteDialog'
import { GroupManageDialog } from './GroupManageDialog'
import { GroupSection } from './GroupSection'
import { NoteItem } from './NoteItem'
import { PinnedSection } from './PinnedSection'
import { SidebarSearch } from './SidebarSearch'
import { UncategorizedSection } from './UncategorizedSection'

/**
 * Props for the {@link NoteSidebar} component.
 *
 * @property selectedNoteId - The ID of the currently selected note, or `null`.
 * @property onSelectNote - Callback invoked when the user selects a note.
 * @property onNewNote - Callback invoked to create a new note.
 * @property onDeleteNote - Callback invoked after a note has been deleted.
 * @property onTogglePin - Callback to pin or unpin a note.
 * @property onExportNote - Callback invoked to export a note as Markdown.
 * @property onDuplicateNote - Callback invoked to duplicate a note.
 * @property onImportNote - Callback invoked to import a Markdown file.
 * @property refreshKey - A monotonically increasing key used to trigger data refresh.
 * @property onRefresh - Callback invoked to bump the refresh key after a mutation.
 */
interface NoteSidebarProps {
  selectedNoteId: string | null
  onSelectNote: (noteId: string | null) => void
  onNewNote: () => void
  onDeleteNote: (noteId: string) => void
  onTogglePin: (noteId: string, pinned: boolean) => void
  onToggleLock: (noteId: string, locked: boolean) => void
  onExportNote: (noteId: string) => void
  onDuplicateNote: (noteId: string) => void
  onImportNote: () => void
  refreshKey: number
  onRefresh: () => void
}

/**
 * Sidebar component displaying notes organised by groups and date.
 *
 * Renders pinned notes at the top, followed by collapsible group
 * sections each containing date sub-groups. Notes without a group
 * appear in an "Uncategorized" section.
 */
export function NoteSidebar({
  selectedNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onTogglePin,
  onToggleLock,
  onExportNote,
  onDuplicateNote,
  onImportNote,
  refreshKey,
  onRefresh,
}: NoteSidebarProps) {
  const { groups, create, rename, remove, reorder, moveNote } = useGroups(
    refreshKey,
    onRefresh
  )
  const { isCollapsed, toggle } = useGroupCollapse()
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    pinnedNotes,
    grouped,
    uncategorized,
    isEmpty,
    noResults,
    debouncedQuery,
  } = useSidebarNotes(refreshKey, groups)

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [justPinnedId, setJustPinnedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [groupManageOpen, setGroupManageOpen] = useState(false)
  const [activeDragNoteId, setActiveDragNoteId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  /**
   * Handles the start of a drag operation.
   *
   * Tracks the dragged note ID so the {@link DragOverlay} can render a preview.
   *
   * @param event - The drag-start event from `@dnd-kit`.
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'note') {
      setActiveDragNoteId(data.noteId as string)
    }
  }, [])

  /**
   * Handles the end of a drag operation.
   *
   * Supports two drag scenarios:
   * 1. **Note -> Group/Uncategorized**: Moves the note to the target group.
   * 2. **Group -> Group**: Reorders the groups by swapping positions.
   *
   * @param event - The drag-end event from `@dnd-kit`.
   */
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragNoteId(null)
      const { active, over } = event
      if (!over) return

      const activeData = active.data.current
      const overData = over.data.current

      // Note dropped on a group or uncategorized
      if (activeData?.type === 'note') {
        const noteId = activeData.noteId as string
        let targetGroupId: string | null | undefined
        if (overData?.type === 'group') {
          targetGroupId = overData.groupId as string
        } else if (overData?.type === 'uncategorized') {
          targetGroupId = null
        }
        if (targetGroupId !== undefined) {
          try {
            await moveNote(noteId, targetGroupId)
          } catch {
            toast.error('Failed to move note')
          }
        }
        return
      }

      // Group reordering
      if (activeData?.type === 'group' && overData?.type === 'group') {
        const oldIndex = groups.findIndex((g) => g.id === active.id)
        const newIndex = groups.findIndex((g) => g.id === over.id)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(groups, oldIndex, newIndex)
          try {
            await reorder(newOrder.map((g) => g.id))
          } catch {
            toast.error('Failed to reorder groups')
          }
        }
      }
    },
    [groups, moveNote, reorder]
  )

  /**
   * Toggles the pin state of a note and triggers a brief bounce animation
   * when pinning.
   *
   * @param noteId - The ID of the note to pin or unpin.
   * @param pinned - `true` to pin, `false` to unpin.
   */
  const handleTogglePin = useCallback(
    (noteId: string, pinned: boolean) => {
      onTogglePin(noteId, pinned)
      if (pinned) {
        setJustPinnedId(noteId)
        setTimeout(() => setJustPinnedId(null), 400)
      }
    },
    [onTogglePin]
  )

  /**
   * Moves a note to a specified group (or to uncategorized).
   *
   * @param noteId - The ID of the note to move.
   * @param groupId - The target group ID, or `null` for uncategorized.
   * @throws Shows an error toast if the move operation fails.
   */
  const handleMoveToGroup = useCallback(
    async (noteId: string, groupId: string | null) => {
      try {
        await moveNote(noteId, groupId)
      } catch {
        toast.error('Failed to move note')
      }
    },
    [moveNote]
  )

  /**
   * Renders a single {@link NoteItem} with the current sidebar state and
   * callbacks wired up.
   *
   * Memoised to avoid unnecessary re-renders when unrelated state changes.
   *
   * @param note - The note to render.
   * @returns The rendered {@link NoteItem} element.
   */
  const renderNoteItem = useCallback(
    (note: Note) => (
      <NoteItem
        key={note.id}
        note={note}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
        onTogglePin={handleTogglePin}
        onToggleLock={onToggleLock}
        onDeleteNote={() => setDeleteTarget(note.id)}
        onExportNote={onExportNote}
        onDuplicateNote={onDuplicateNote}
        onMoveToGroup={handleMoveToGroup}
        groups={groups}
        justPinnedId={justPinnedId}
      />
    ),
    [
      selectedNoteId,
      onSelectNote,
      handleTogglePin,
      onToggleLock,
      onDuplicateNote,
      onExportNote,
      handleMoveToGroup,
      groups,
      justPinnedId,
    ]
  )

  /**
   * Renders the main body of the sidebar based on the current state.
   *
   * Handles four visual states:
   * - **noResults**: Shows a "no matches" message when a search yields nothing.
   * - **isEmpty**: Shows a placeholder when there are no notes at all.
   * - **isSearching**: Flattens all groups into date-bucketed results.
   * - **default**: Renders pinned section, group sections, and uncategorized section.
   *
   * @returns The rendered sidebar body content.
   */
  function renderSidebarBody(): React.ReactNode {
    if (noResults) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Search className="h-8 w-8" />
          <p className="text-xs">No notes match &quot;{debouncedQuery}&quot;</p>
        </div>
      )
    }

    if (isEmpty) {
      return <p className="p-4 text-muted-foreground text-sm">No notes yet</p>
    }

    // During search: bypass groups, show flat date-grouped results
    if (isSearching) {
      const searchBuckets = bucketByDate(
        grouped
          .flatMap((g) => g.dateBuckets.flatMap((b) => b.items))
          .concat(uncategorized.flatMap((b) => b.items))
      )
      return searchBuckets.map((bucket) => (
        <DateGroup
          key={bucket.label}
          bucket={bucket}
          renderNoteItem={renderNoteItem}
        />
      ))
    }

    const hasGroups = groups.length > 0

    return (
      <>
        <PinnedSection notes={pinnedNotes} renderNoteItem={renderNoteItem} />

        {hasGroups ? (
          <>
            <SortableContext
              items={groups.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {grouped.map((g) => (
                <GroupSection
                  key={g.group.id}
                  groupWithNotes={g}
                  isCollapsed={isCollapsed(g.group.id)}
                  onToggleCollapse={() => toggle(g.group.id)}
                  onRename={rename}
                  onDelete={remove}
                  renderNoteItem={renderNoteItem}
                />
              ))}
            </SortableContext>

            {grouped.length > 0 && uncategorized.length > 0 && (
              <SidebarSeparator className="mx-3" />
            )}

            <UncategorizedSection
              dateBuckets={uncategorized}
              isCollapsed={isCollapsed('__uncategorized__')}
              onToggleCollapse={() => toggle('__uncategorized__')}
              renderNoteItem={renderNoteItem}
            />
          </>
        ) : (
          // No groups defined: show flat date-grouped notes (original behavior)
          uncategorized.map((bucket) => (
            <DateGroup
              key={bucket.label}
              bucket={bucket}
              renderNoteItem={renderNoteItem}
            />
          ))
        )}
      </>
    )
  }

  // Find dragged note for DragOverlay
  const allNotes = grouped
    .flatMap((g) => g.dateBuckets.flatMap((b) => b.items))
    .concat(uncategorized.flatMap((b) => b.items))
    .concat(pinnedNotes)
  const draggedNote = activeDragNoteId
    ? (allNotes.find((n) => n.id === activeDragNoteId) ?? null)
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Sidebar>
        <SidebarSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onNewNote={onNewNote}
        />
        <SidebarContent>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {renderSidebarBody()}
          </div>
        </SidebarContent>
        <SidebarFooter>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setGroupManageOpen(true)}
          >
            <FolderCog className="h-4 w-4" />
            Manage Groups
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={onImportNote}
          >
            <Upload className="h-4 w-4" />
            Import Markdown
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </SidebarFooter>
        <GroupManageDialog
          open={groupManageOpen}
          onOpenChange={setGroupManageOpen}
          groups={groups}
          onCreate={create}
          onRename={rename}
          onDelete={remove}
        />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <DeleteNoteDialog
          noteId={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={onDeleteNote}
        />
      </Sidebar>
      <DragOverlay dropAnimation={null}>
        {draggedNote && (
          <div className="max-w-[200px] truncate rounded-md border border-border bg-sidebar px-3 py-2 text-sm opacity-80 shadow-lg">
            {draggedNote.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
