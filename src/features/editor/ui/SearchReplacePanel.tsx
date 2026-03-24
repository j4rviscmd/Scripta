import { type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  ArrowUp,
  ArrowDown,
  Replace,
  X,
} from "lucide-react";

/**
 * Props for the {@link SearchReplacePanel} component.
 *
 * All state and callbacks are provided by the {@link useSearchReplace} hook.
 */
interface SearchReplacePanelProps {
  isOpen: boolean;
  query: string;
  replaceText: string;
  caseSensitive: boolean;
  useRegex: boolean;
  matchCount: number;
  currentMatchIndex: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  open: () => void;
  close: () => void;
  setQuery: (q: string) => void;
  setReplaceText: (t: string) => void;
  toggleCaseSensitive: () => void;
  toggleUseRegex: () => void;
  goNext: () => void;
  goPrev: () => void;
  replaceOne: () => void;
  replaceAll: () => void;
}

/**
 * Inline search & replace panel rendered at the bottom of the editor.
 *
 * Provides a search input with case-sensitivity and regex toggles,
 * match navigation (previous / next), and replace / replace-all actions.
 * Keyboard shortcuts (Enter / Shift+Enter for navigation, Escape to close)
 * are handled at the hook level.
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
  if (!isOpen) return null;

  const matchLabel =
    matchCount === 0
      ? "No results"
      : `${currentMatchIndex + 1}/${matchCount}`;

  return (
    <div className="search-panel sticky bottom-0 z-20 flex items-center gap-1 border-t border-border bg-background px-4 py-1.5">
      {/* Search input */}
      <div className="relative w-48">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find..."
          className="h-7 pl-7 pr-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              e.shiftKey ? goPrev() : goNext();
              return;
            }
            e.stopPropagation();
          }}
        />
      </div>
      <Button
        variant={caseSensitive ? "secondary" : "ghost"}
        size="icon-xs"
        onClick={toggleCaseSensitive}
        title="Match case"
        aria-label="Match case"
      >
        <span className="text-xs font-bold">Aa</span>
      </Button>
      <Button
        variant={useRegex ? "secondary" : "ghost"}
        size="icon-xs"
        onClick={toggleUseRegex}
        title="Use regex"
        aria-label="Use regular expression"
      >
        <span className="text-xs font-bold">.*</span>
      </Button>
      <span className="min-w-[3rem] text-center text-xs text-muted-foreground">
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

      {/* Separator */}
      <div className="mx-1 h-4 w-px bg-border" />

      {/* Replace input */}
      <div className="relative w-48">
        <Replace className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          placeholder="Replace..."
          className="h-7 pl-7 pr-1 text-sm"
          onKeyDown={(e) => e.stopPropagation()}
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
  );
}
