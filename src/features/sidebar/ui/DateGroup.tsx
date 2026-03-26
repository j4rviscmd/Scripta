import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import type { Note } from "@/features/editor";
import type { DateBucket } from "@/features/groups";

interface DateGroupProps {
  bucket: DateBucket;
  renderNoteItem: (note: Note) => React.ReactNode;
}

/**
 * Renders a single date bucket (e.g. "Today") with its notes.
 */
export function DateGroup({ bucket, renderNoteItem }: DateGroupProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{bucket.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{bucket.items.map(renderNoteItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
