/**
 * Settings section for customizing the FormattingToolbar item order
 * and visibility via drag-and-drop sorting and toggle switches.
 *
 * @module features/settings/ui/ToolbarOption
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Baseline, GripVertical, Highlighter, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback } from 'react'
import {
  RiAlignCenter,
  RiAlignLeft,
  RiAlignRight,
  RiBold,
  RiIndentDecrease,
  RiIndentIncrease,
  RiItalic,
  RiLink,
  RiStrikethrough,
  RiUnderline,
} from 'react-icons/ri'
import { useToolbarConfig } from '@/app/providers/toolbar-config-provider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ToolbarItemConfig } from '@/features/settings/lib/toolbarConfig'
import { TOOLBAR_ITEM_LABELS } from '@/features/settings/lib/toolbarConfig'
import { cn } from '@/lib/utils'

/** Icon size in pixels used for all toolbar item icons in this settings panel. */
const ICON_SIZE = 14
/** Shared CSS class that prevents icons from shrinking in a flex layout. */
const ICON_CLASS = 'shrink-0'

/** Icons matching the actual BubbleMenu buttons. */
const TOOLBAR_ITEM_ICONS: Record<string, ReactNode> = {
  boldStyleButton: <RiBold size={ICON_SIZE} className={ICON_CLASS} />,
  italicStyleButton: <RiItalic size={ICON_SIZE} className={ICON_CLASS} />,
  underlineStyleButton: <RiUnderline size={ICON_SIZE} className={ICON_CLASS} />,
  strikeStyleButton: (
    <RiStrikethrough size={ICON_SIZE} className={ICON_CLASS} />
  ),
  textAlignLeftButton: <RiAlignLeft size={ICON_SIZE} className={ICON_CLASS} />,
  textAlignCenterButton: (
    <RiAlignCenter size={ICON_SIZE} className={ICON_CLASS} />
  ),
  textAlignRightButton: (
    <RiAlignRight size={ICON_SIZE} className={ICON_CLASS} />
  ),
  colorStyleButton: <Baseline size={ICON_SIZE} className={ICON_CLASS} />,
  highlightButton: <Highlighter size={ICON_SIZE} className={ICON_CLASS} />,
  nestBlockButton: <RiIndentIncrease size={ICON_SIZE} className={ICON_CLASS} />,
  unnestBlockButton: (
    <RiIndentDecrease size={ICON_SIZE} className={ICON_CLASS} />
  ),
  createLinkButton: <RiLink size={ICON_SIZE} className={ICON_CLASS} />,
}

/**
 * A single sortable row in the toolbar items list.
 *
 * Renders a drag handle, the item label, and a visibility toggle switch.
 *
 * @param props - Component props.
 * @param props.item - The toolbar item configuration (key and visibility).
 * @param props.onToggle - Callback invoked with the item's key when the visibility toggle is clicked.
 */
function SortableToolbarItem({
  item,
  onToggle,
}: {
  item: ToolbarItemConfig
  onToggle: (key: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between rounded-md px-3 py-1.5',
        isDragging && 'z-50 bg-accent opacity-80 shadow-sm'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
        </span>
        {TOOLBAR_ITEM_ICONS[item.key] && (
          <span
            className={cn(
              'text-foreground',
              !item.visible && 'text-muted-foreground'
            )}
          >
            {TOOLBAR_ITEM_ICONS[item.key]}
          </span>
        )}
        <Label
          className={cn(
            'text-sm',
            !item.visible && 'text-muted-foreground line-through'
          )}
        >
          {TOOLBAR_ITEM_LABELS[item.key] ?? item.key}
        </Label>
      </div>
      <Switch
        checked={item.visible}
        onCheckedChange={() => onToggle(item.key)}
        aria-label={`Toggle ${TOOLBAR_ITEM_LABELS[item.key] ?? item.key}`}
      />
    </div>
  )
}

/**
 * Settings section for the FormattingToolbar.
 *
 * Renders a drag-and-drop sortable list of toolbar items, each with a
 * visibility toggle switch. Includes a "Reset" button when the
 * configuration differs from the default.
 */
export function ToolbarOption() {
  const { items, reorder, toggleVisibility, reset, isCustomized } =
    useToolbarConfig()

  /** DnD sensors: pointer drag (5 px activation distance) and keyboard arrow keys. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  /**
   * Handles the end of a drag event by computing the old and new indices
   * and delegating to the `reorder` callback from the toolbar config provider.
   *
   * @param event - The drag-end event from `@dnd-kit/core`.
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = items.findIndex((i) => i.key === active.id)
      const newIndex = items.findIndex((i) => i.key === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        reorder(oldIndex, newIndex)
      }
    },
    [items, reorder]
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-3">
        <p className="font-medium text-muted-foreground text-xs">
          Formatting Toolbar
        </p>
        {isCustomized && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={reset}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.key)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableToolbarItem
              key={item.key}
              item={item}
              onToggle={toggleVisibility}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
