import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/app/providers/store-provider";

/**
 * Maps note IDs to their last-visible BlockNote block `data-id` values.
 * Used as the in-memory representation of persisted scroll positions.
 *
 * @example
 * ```ts
 * { "note-abc123": "block-xyz789" }
 * ```
 */
type ScrollPositions = Record<string, string>;

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
 * tauri-plugin-store, and restores the scroll position when a note's
 * content has finished loading.
 *
 * Uses an in-memory cache (`useRef`) for synchronous reads during
 * scroll restoration, and asynchronously persists changes to the
 * store (fire-and-forget).
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
  const { editorState: editorStore } = useAppStore();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId = useRef<number>(0);
  const restoredRef = useRef<string | null>(null);
  const positionsRef = useRef<ScrollPositions>({});

  // Load persisted scroll positions from the store on first mount.
  useEffect(() => {
    editorStore.get<ScrollPositions>("scrollPositions").then((map) => {
      if (map) positionsRef.current = map;
    }).catch((err) => {
      console.error("Failed to load scrollPositions:", err);
    });
  }, [editorStore]);

  /** Persists the in-memory position map to the store (fire-and-forget). */
  const persistPositions = useCallback(() => {
    editorStore.set("scrollPositions", { ...positionsRef.current }).catch((err) => {
      console.error("Failed to persist scrollPositions:", err);
    });
  }, [editorStore]);

  /** Persists the first visible block ID for the given note. */
  const savePositionForNote = useCallback(
    (targetNoteId: string) => {
      const container = containerRef.current;
      if (!container) return;

      const blockId = findFirstVisibleBlockId(container);
      if (blockId) {
        positionsRef.current[targetNoteId] = blockId;
        persistPositions();
      }
    },
    [containerRef, persistPositions],
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
  const saveScrollPosition = savePositionForNote;

  /** Scrolls to the saved block for the given note. */
  const restoreScrollPosition = useCallback(
    (targetNoteId: string) => {
      const container = containerRef.current;
      if (!container) return;

      const savedBlockId = positionsRef.current[targetNoteId];
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
