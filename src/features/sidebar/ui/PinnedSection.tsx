import { Pin } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { Note } from "@/features/editor";

interface PinnedSectionProps {
  notes: Note[];
  renderNoteItem: (note: Note) => React.ReactNode;
}

/**
 * Displays pinned notes at the top of the sidebar.
 *
 * Only rendered when there are pinned notes to show.
 */
export function PinnedSection({ notes, renderNoteItem }: PinnedSectionProps) {
  if (notes.length === 0) return null;

  return (
    <>
      <SidebarGroup className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
        <SidebarGroupLabel className="flex items-center gap-1 text-[10px] [&>svg]:!size-2.5">
          <Pin className="fill-primary text-primary" />
          Pinned
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{notes.map(renderNoteItem)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarSeparator className="mx-3 animate-in fade-in-0 duration-500 delay-150" />
    </>
  );
}
