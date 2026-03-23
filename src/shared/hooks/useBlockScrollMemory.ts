import { useCallback, useEffect, useRef } from "react";

/** localStorage key for per-note scroll position map. */
const SCROLL_POSITIONS_KEY = "scripta:scrollPositions";

/**
 * Maps note IDs to their last-visible BlockNote block `data-id` values.
 * Used as the in-memory representation of persisted scroll positions.
 */
type ScrollPositions = Record<string, string>;

/**
 * Loads the persisted scroll-position map from localStorage.
 *
 * @returns The parsed map, or an empty object if parsing fails or no data exists.
 */
function loadPositions(): ScrollPositions {
  try {
    const raw = localStorage.getItem(SCROLL_POSITIONS_KEY);
    return raw ? (JSON.parse(raw) as ScrollPositions) : {};
  } catch {
    return {};
  }
}

/**
 * Persists the scroll-position map to localStorage.
 * Silently ignores storage errors (e.g. quota exceeded).
 *
 * @param map - The scroll-position map to persist.
 */
function savePositions(map: ScrollPositions): void {
  try {
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(map));
  } catch { /* noop */ }
}

/**
 * Persists the visible block ID for a single note.
 * Merges into the existing position map to avoid overwriting other notes' data.
 *
 * @param noteId - The note whose scroll position is being saved.
 * @param blockId - The `data-id` of the currently visible BlockNote block.
 */
function saveScrollBlockId(noteId: string, blockId: string): void {
  const map = loadPositions();
  map[noteId] = blockId;
  savePositions(map);
}

/**
 * Retrieves the persisted block ID for a given note.
 *
 * @param noteId - The note whose scroll position is being retrieved.
 * @returns The saved block `data-id`, or `null` if no position was stored.
 */
function loadScrollBlockId(noteId: string): string | null {
  return loadPositions()[noteId] ?? null;
}

/**
 * Returns the `data-id` of the first BlockNote block whose top edge
 * is visible inside the given scroll container.
 *
 * Iterates over all `[data-node-type="blockContainer"][data-id]` elements
 * and returns the first one whose top coordinate falls within the
 * container's visible vertical range.
 *
 * @param container - The scrollable container element to inspect.
 * @returns The `data-id` of the first visible block, or `null` if none is found.
 */
function findFirstVisibleBlockId(container: HTMLElement): string | null {
  const containerRect = container.getBoundingClientRect();
  const blocks = container.querySelectorAll<HTMLElement>(
    '[data-node-type="blockContainer"][data-id]',
  );

  for (const block of blocks) {
    const blockRect = block.getBoundingClientRect();
    if (
      blockRect.top >= containerRect.top &&
      blockRect.top < containerRect.bottom
    ) {
      return block.getAttribute("data-id");
    }
  }

  return null;
}

/**
 * Options for the {@link useBlockScrollMemory} hook.
 *
 * @property containerRef - Ref to the scrollable container element.
 * @property noteId - The currently active note ID, or `null` when no note is selected.
 */
interface UseBlockScrollMemoryOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  noteId: string | null;
}

/**
 * Persists the currently visible BlockNote block ID per note in
 * localStorage, and restores the scroll position when a note's
 * content has finished loading.
 *
 * **Save triggers**:
 * - Debounced scroll (500 ms) during normal scrolling
 * - `saveScrollPosition(noteId)` called imperatively before a note switch
 * - `visibilitychange` (tab / window hidden)
 *
 * **Restore**: scrolls synchronously inside the `onContentLoaded` callback
 * (a microtask after `replaceBlocks`), so the browser never paints the
 * intermediate top-of-document state. Falls back to the top when the
 * block no longer exists.
 *
 * @param options - Hook configuration options.
 * @param options.containerRef - Ref to the scrollable container element.
 * @param options.noteId - The currently active note ID, or `null`.
 * @returns An object containing:
 *   - `onContentLoaded` - Callback to invoke after editor content has been loaded.
 *   - `saveScrollPosition` - Imperative function to save scroll position for a given note.
 */
export function useBlockScrollMemory({
  containerRef,
  noteId,
}: UseBlockScrollMemoryOptions) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId = useRef<number>(0);
  const restoredRef = useRef<string | null>(null);

  /** Persists the first visible block ID for the given note. */
  const savePositionForNote = useCallback(
    (targetNoteId: string) => {
      const container = containerRef.current;
      if (!container) return;

      const blockId = findFirstVisibleBlockId(container);
      if (blockId) {
        saveScrollBlockId(targetNoteId, blockId);
      }
    },
    [containerRef],
  );

  /** Persists the first visible block ID for the current note. */
  const saveCurrentPosition = useCallback(() => {
    if (!noteId) return;
    savePositionForNote(noteId);
  }, [noteId, savePositionForNote]);

  /**
   * Imperatively saves the scroll position for a given note.
   * Call this BEFORE updating `noteId` state so the DOM still
   * contains the correct block elements.
   */
  const saveScrollPosition = useCallback(
    (targetNoteId: string) => {
      savePositionForNote(targetNoteId);
    },
    [savePositionForNote],
  );

  /** Scrolls to the saved block for the given note. */
  const restoreScrollPosition = useCallback(
    (targetNoteId: string) => {
      const container = containerRef.current;
      if (!container) return;

      const savedBlockId = loadScrollBlockId(targetNoteId);
      if (!savedBlockId) return;

      const escaped = CSS.escape(savedBlockId);
      const blockEl = container.querySelector<HTMLElement>(
        `[data-node-type="blockContainer"][data-id="${escaped}"]`,
      );

      if (blockEl) {
        const blockTop = blockEl.getBoundingClientRect().top;
        const containerTop = container.getBoundingClientRect().top;
        const offset = blockTop - containerTop + container.scrollTop;
        container.scrollTo({ top: offset });
      }
    },
    [containerRef],
  );

  // --- Scroll listener (debounced save) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (rafId.current) return;

      rafId.current = requestAnimationFrame(() => {
        clearTimeout(debounceTimerRef.current!);
        debounceTimerRef.current = setTimeout(saveCurrentPosition, 500);
        rafId.current = 0;
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId.current);
      clearTimeout(debounceTimerRef.current!);
    };
  }, [containerRef, saveCurrentPosition]);

  // --- Save on visibility change ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveCurrentPosition();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveCurrentPosition]);

  // --- Reset restore guard when no note is selected ---
  useEffect(() => {
    if (!noteId) {
      restoredRef.current = null;
    }
  }, [noteId]);

  // --- Handle content loaded callback ---
  const onContentLoaded = useCallback(() => {
    if (!noteId) return;
    if (restoredRef.current === noteId) return;
    restoredRef.current = noteId;
    restoreScrollPosition(noteId);
  }, [noteId, restoreScrollPosition]);

  return { onContentLoaded, saveScrollPosition };
}
