import { ChevronRight, Inbox } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/editor";
import type { DateBucket } from "@/features/groups";
import { DateGroup } from "./DateGroup";

interface UncategorizedSectionProps {
  dateBuckets: DateBucket[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  renderNoteItem: (note: Note) => React.ReactNode;
}

/**
 * The "Uncategorized" section for notes not assigned to any group.
 *
 * Acts as a drop target so notes can be dragged here to remove
 * their group assignment.
 */
export function UncategorizedSection({
  dateBuckets,
  isCollapsed,
  onToggleCollapse,
  renderNoteItem,
}: UncategorizedSectionProps) {
  const noteCount = dateBuckets.reduce((sum, b) => sum + b.items.length, 0);

  const { setNodeRef, isOver } = useDroppable({
    id: "drop-uncategorized",
    data: { type: "uncategorized" },
  });

  if (noteCount === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        ref={setNodeRef}
        className={cn(
          "cursor-pointer select-none hover:bg-sidebar-accent/50 rounded-md transition-colors",
          isOver && "bg-primary/10 ring-1 ring-primary/30",
        )}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-1 flex-1">
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform duration-200",
              !isCollapsed && "rotate-90",
            )}
          />
          <Inbox className="h-3 w-3 shrink-0" />
          <span>Uncategorized</span>
        </div>
        {noteCount > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {noteCount}
          </span>
        )}
      </SidebarGroupLabel>
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
  );
}
