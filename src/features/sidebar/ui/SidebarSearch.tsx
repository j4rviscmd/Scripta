import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarHeader } from '@/components/ui/sidebar'

interface SidebarSearchProps {
  query: string
  onQueryChange: (query: string) => void
  onNewNote: () => void
}

/**
 * Search input and new-note button displayed in the sidebar header.
 */
export function SidebarSearch({
  query,
  onQueryChange,
  onNewNote,
}: SidebarSearchProps) {
  return (
    <SidebarHeader className="flex flex-row items-center gap-2 border-b px-3 py-2">
      <div className="relative flex-1">
        <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search notes..."
          className="h-8 border-transparent bg-muted/50 pr-8 pl-8 text-sm focus:border-border focus:bg-background"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 h-5 w-5 -translate-y-1/2"
            onClick={() => onQueryChange('')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => {
          e.currentTarget.blur()
          onNewNote()
        }}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </SidebarHeader>
  )
}
