import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createNote, updateNote } from "../api/notes";
import { extractTitle } from "../lib/constants";

/** Possible auto-save statuses exposed for UI feedback. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Auto-save hook with configurable debounce delay.
 *
 * Call `scheduleSave(content)` to trigger a debounced save.
 * Creates a new note on first save, then updates on subsequent changes.
 *
 * Internally the hook maintains a `savingRef` guard so that concurrent
 * saves are never executed.
 *
 * The pending timer is cleared on unmount, and any unsaved content is
 * flushed immediately to prevent data loss.
 *
 * @param delay - Debounce delay in milliseconds (default: 500)
 * @param initialNoteId - If provided, skip the initial create and start updating this note.
 * @param onNoteSaved - Called with the note ID after every successful save (create or update).
 * @returns An object containing:
 *   - `noteIdRef` - A React ref holding the current note UUID (or `null` before the first save).
 *   - `scheduleSave` - A callback that accepts the editor content string and schedules a debounced save.
 *
 * @example
 * ```typescript
 * const { noteIdRef, scheduleSave } = useAutoSave(1000);
 *
 * const onChange = (content: string) => {
 *   scheduleSave(content);
 * };
 * ```
 */
export function useAutoSave(
  delay = 500,
  initialNoteId?: string,
  onNoteSaved?: (id: string) => void,
) {
  const contentRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstSave = useRef(!initialNoteId);
  const noteIdRef = useRef<string | null>(initialNoteId ?? null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  /**
   * Persists the current editor content to the backend.
   *
   * On the first save, a new note is created via `createNote`.
   * On subsequent saves, the existing note is updated via `updateNote`.
   * A `savingRef` guard prevents concurrent executions.
   *
   * @param silent - When `true`, suppresses toast notifications and the
   *   `onNoteSaved` callback (used during unmount flush to avoid updating
   *   unmounted components).
   */
  const save = useCallback(
    async (silent = false) => {
      if (savingRef.current) return;
      savingRef.current = true;
      if (!silent) setSaveStatus("saving");

      const shouldNotify = !silent && mountedRef.current;

      try {
        const content = contentRef.current;
        const title = extractTitle(content);
        let savedId: string | null = null;

        if (isFirstSave.current) {
          const note = await createNote(title, content);
          noteIdRef.current = note.id;
          isFirstSave.current = false;
          savedId = note.id;
        } else if (noteIdRef.current) {
          await updateNote(noteIdRef.current, title, content);
          savedId = noteIdRef.current;
        }

        if (savedId) {
          dirtyRef.current = false;
          if (shouldNotify) {
            onNoteSaved?.(savedId);
            setSaveStatus("saved");
          }
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
        if (shouldNotify) {
          setSaveStatus("error");
          toast.error("Auto-save failed");
        }
      } finally {
        savingRef.current = false;
      }
    },
    [onNoteSaved],
  );

  // Keep a stable ref to save so the cleanup effect doesn't need save in its deps.
  const saveRef = useRef(save);
  saveRef.current = save;

  /**
   * Schedules a debounced save of the given editor content.
   *
   * Any previously scheduled save is cancelled so that only the
   * most recent content is persisted after the debounce delay.
   *
   * @param content - The serialized BlockNote document JSON string.
   */
  const scheduleSave = useCallback(
    (content: string) => {
      contentRef.current = content;
      dirtyRef.current = true;
      setSaveStatus("idle");
      clearTimeout(timerRef.current!);
      timerRef.current = setTimeout(save, delay);
    },
    [save, delay],
  );

  /**
   * Cleanup effect that flushes unsaved content on unmount.
   *
   * When the component unmounts, any pending debounce timer is cleared.
   * If there is dirty (unsaved) content, a final silent save is
   * triggered immediately to prevent data loss.
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current!);
      if (dirtyRef.current) {
        saveRef.current(true);
      }
    };
  }, []);

  return { noteIdRef, scheduleSave, saveStatus };
}
