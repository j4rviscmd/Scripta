import { ArrowDown, ArrowUp, Replace, Search, X } from 'lucide-react'
import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Props for the {@link SearchReplacePanel} component.
 *
 * All state and callbacks are provided by the {@link useSearchReplace} hook.
 */
interface SearchReplacePanelProps {
  isOpen: boolean
  query: string
  replaceText: string
  caseSensitive: boolean
  useRegex: boolean
  matchCount: number
  currentMatchIndex: number
  searchInputRef: RefObject<HTMLInputElement | null>
  open: () => void
  close: () => void
  setQuery: (q: string) => void
  setReplaceText: (t: string) => void
  toggleCaseSensitive: () => void
  toggleUseRegex: () => void
  goNext: () => void
  goPrev: () => void
  replaceOne: () => void
  replaceAll: () => void
}

/**
 * Inline search & replace panel rendered at the bottom of the editor.
 *
 * Provides a search input with case-sensitivity and regex toggles,
 * match navigation (previous / next), and replace / replace-all actions.
 * Keyboard shortcuts (Enter / Shift+Enter for navigation, Escape to close)
 * are handled at both the component and hook levels.
 *
 * The panel is conditionally rendered based on the `isOpen` prop.
 */
export function SearchReplacePanel({
  isOpen,
  query,
  replaceText,
  caseSensitive,
  useRegex,
  matchCount,
  currentMatchIndex,
  searchInputRef,
  setQuery,
  setReplaceText,
  toggleCaseSensitive,
  toggleUseRegex,
  goNext,
  goPrev,
  replaceOne,
  replaceAll,
  close,
}: SearchReplacePanelProps) {
  if (!isOpen) return null

  function stopAndClose(e: React.KeyboardEvent) {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    close()
  }

  function stopPropagate(e: React.KeyboardEvent) {
    e.stopPropagation()
  }

  const matchLabel =
    matchCount === 0 ? 'No results' : `${currentMatchIndex + 1}/${matchCount}`

  return (
    <div className="search-panel sticky bottom-0 z-20 flex items-center gap-1 border-border border-t bg-background px-4 py-1.5">
      <div className="relative w-48">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find..."
          className="h-7 pr-1 pl-7 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              stopAndClose(e)
              return
            }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.nativeEvent.stopImmediatePropagation()
              e.shiftKey ? goPrev() : goNext()
              return
            }
            stopPropagate(e)
          }}
        />
      </div>
      <Button
        variant={caseSensitive ? 'secondary' : 'ghost'}
        size="icon-xs"
        onClick={toggleCaseSensitive}
        title="Match case"
        aria-label="Match case"
      >
        <span className="font-bold text-xs">Aa</span>
      </Button>
      <Button
        variant={useRegex ? 'secondary' : 'ghost'}
        size="icon-xs"
        onClick={toggleUseRegex}
        title="Use regex"
        aria-label="Use regular expression"
      >
        <span className="font-bold text-xs">.*</span>
      </Button>
      <span className="min-w-[3rem] text-center text-muted-foreground text-xs">
        {matchLabel}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={goPrev}
        disabled={matchCount === 0}
        title="Previous (Shift+Enter)"
        aria-label="Previous match"
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={goNext}
        disabled={matchCount === 0}
        title="Next (Enter)"
        aria-label="Next match"
      >
        <ArrowDown className="size-3.5" />
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />
      <div className="relative w-48">
        <Replace className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          placeholder="Replace..."
          className="h-7 pr-1 pl-7 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              stopAndClose(e)
              return
            }
            stopPropagate(e)
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="xs"
        onClick={replaceOne}
        disabled={matchCount === 0}
        className="text-xs"
      >
        Replace
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onClick={replaceAll}
        disabled={matchCount === 0}
        className="text-xs"
      >
        Replace all
      </Button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={close}
        title="Close (Escape)"
        aria-label="Close search"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
