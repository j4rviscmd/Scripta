import { useCallback, useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";
import { toast } from "sonner";
import { getNote } from "../api/notes";
import { useAutoSave } from "../hooks/useAutoSave";
import { DEFAULT_BLOCKS } from "../lib/constants";
import { useTheme } from "@/app/providers/theme-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCKS = DEFAULT_BLOCKS as any;

/**
 * Rich-text editor component powered by BlockNote.
 *
 * When a `noteId` is provided the editor loads the persisted content
 * and switches to update-mode for auto-save.  Without a `noteId` the
 * editor starts with default content and creates a new note on first
 * keystroke.
 *
 * @param props - Editor component props.
 * @param props.noteId - The UUID of the note to edit, or `null` to start a new note.
 * @param props.onNoteSaved - Callback invoked with the note ID after each successful auto-save.
 * @returns The rendered editor view.
 */
export function Editor({
  noteId,
  onNoteSaved,
}: {
  noteId: string | null;
  onNoteSaved?: (id: string) => void;
}) {
  const loadingRef = useRef(true);
  const { resolvedTheme } = useTheme();

  const { scheduleSave } = useAutoSave(500, noteId ?? undefined, onNoteSaved);

  const editor = useCreateBlockNote({
    initialContent: DEFAULT_BLOCKS,
  });

  useEffect(() => {
    loadingRef.current = true;
    if (!noteId) {
      editor.replaceBlocks(editor.document, BLOCKS);
      // Defer to next tick so the synchronous replaceBlocks doesn't
      // accidentally trigger a save via the onChange callback.
      queueMicrotask(() => {
        loadingRef.current = false;
      });
      return;
    }

    getNote(noteId)
      .then((note) => {
        if (note) {
          try {
            editor.replaceBlocks(editor.document, JSON.parse(note.content) as any);
          } catch {
            editor.replaceBlocks(editor.document, BLOCKS);
          }
        }
      })
      .catch(() => {
        toast.error("Failed to load note");
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [noteId, editor]);

  /**
   * BlockNote change handler.  Serialises the current document and
   * schedules a debounced save, but only after the initial content
   * has finished loading (guarded by `loadingRef`).
   */
  const handleChange = useCallback(() => {
    if (!loadingRef.current) {
      scheduleSave(JSON.stringify(editor.document));
    }
  }, [editor, scheduleSave]);

  return (
    <main className="w-full min-h-screen overflow-y-auto p-8">
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        onChange={handleChange}
      />
    </main>
  );
}
