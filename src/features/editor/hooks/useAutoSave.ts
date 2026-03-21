import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createNote, updateNote } from "../api/notes";

/** Union type representing a single inline element produced by BlockNote. */
type InlineContent =
  | string
  | { type: string; text?: string; children?: InlineContent[] };

/**
 * Recursively extracts plain text from BlockNote inline content.
 *
 * Handles three forms of inline content:
 * - A plain string literal.
 * - An object with a `text` property.
 * - An object with nested `children` arrays (e.g. bold / italic wrappers).
 *
 * @param content - An inline content node produced by BlockNote.
 * @returns The concatenated plain-text representation.
 */
function inlineToText(content: InlineContent): string {
  if (typeof content === "string") return content;
  if (content.text) return content.text;
  if (content.children) return content.children.map(inlineToText).join("");
  return "";
}

/**
 * Extracts a title from the first heading block in BlockNote document JSON.
 *
 * The function parses the document JSON, locates the first block whose
 * `type` is `"heading"`, and concatenates its inline content into a plain
 * text string truncated to 200 characters. If no heading block exists or
 * the JSON cannot be parsed, the function falls back to `"Untitled"`.
 *
 * @param content - The raw BlockNote document JSON string.
 * @returns The extracted title, or `"Untitled"` as a default.
 */
function extractTitle(content: string): string {
  try {
    const blocks = JSON.parse(content) as Array<{
      type: string;
      content?: InlineContent[];
    }>;
    const heading = blocks.find((b) => b.type === "heading");
    if (heading?.content) {
      const text = heading.content.map(inlineToText).join("");
      return text.slice(0, 200) || "Untitled";
    }
  } catch {
    // ignore parse errors
  }
  return "Untitled";
}

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

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const content = contentRef.current;
      const title = extractTitle(content);
      const currentId = noteIdRef.current;
      if (isFirstSave.current) {
        const note = await createNote(title, content);
        noteIdRef.current = note.id;
        isFirstSave.current = false;
        onNoteSaved?.(note.id);
        toast.success("Note created");
      } else if (currentId) {
        await updateNote(currentId, title, content);
        onNoteSaved?.(currentId);
        toast.success("Saved", { duration: 1500 });
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
      toast.error("Auto-save failed");
    } finally {
      savingRef.current = false;
    }
  }, [onNoteSaved]);

  const scheduleSave = useCallback(
    (content: string) => {
      contentRef.current = content;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(save, delay);
    },
    [save, delay],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      save();
    };
  }, []);

  return { noteIdRef, scheduleSave };
}
