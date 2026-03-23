import { useCallback, useEffect, useRef } from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useCreateBlockNote,
  LinkToolbarController,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { CustomLinkToolbar } from "./CustomLinkToolbar";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";
import { toast } from "sonner";
import { getNote } from "../api/notes";
import { useAutoSave } from "../hooks/useAutoSave";
import { useLinkPreview } from "../hooks/useLinkPreview";
import { useLinkClickHandler } from "../hooks/useLinkClickHandler";
import type { SaveStatus } from "..";
import { DEFAULT_BLOCKS } from "../lib/constants";
import { cursorCenteringExtension, useCursorCentering } from "..";
import { useTheme } from "@/app/providers/theme-provider";
import { HighlightButton } from "./HighlightButton";

/**
 * Default block content cast to the BlockNote generic type.
 *
 * BlockNote's `replaceBlocks` requires the content to match the
 * generic type parameter of the editor. Since the default blocks
 * are a plain JSON structure, we cast them to satisfy the type
 * constraint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCKS = DEFAULT_BLOCKS as any;

/**
 * Props for the {@link Editor} component.
 *
 * @property noteId - The UUID of the note to edit, or `null` to start a new note.
 * @property onNoteSaved - Callback invoked with the note ID after each successful auto-save.
 * @property onStatusChange - Callback invoked when the save status changes
 *   (e.g. `"saving"`, `"saved"`, `"error"`).
 * @property onContentLoaded - Called after the note content has been loaded
 *   into the editor (or defaults applied).
 */
interface EditorProps {
  noteId: string | null;
  onNoteSaved?: (id: string) => void;
  onStatusChange?: (status: SaveStatus) => void;
  onContentLoaded?: () => void;
}

/**
 * Builds the array of formatting toolbar items with the custom
 * {@link HighlightButton} injected after the built-in color-style button.
 *
 * @returns The augmented array of formatting toolbar items.
 */
function buildFormattingToolbarItems() {
  const items = getFormattingToolbarItems();
  const colorIndex = items.findIndex(
    (item) => item.key === "colorStyleButton",
  );
  if (colorIndex === -1) return items;
  return [
    ...items.slice(0, colorIndex + 1),
    <HighlightButton key="highlightButton" />,
    ...items.slice(colorIndex + 1),
  ];
}

const formattingToolbarItems = buildFormattingToolbarItems();

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
 * @param props.onStatusChange - Callback invoked when the save status changes
 *   (e.g. `"saving"`, `"saved"`, `"error"`).
 * @param props.onContentLoaded - Called after the note content has been loaded
 *   into the editor (or defaults applied).
 * @returns The rendered editor view.
 */
export function Editor({
  noteId,
  onNoteSaved,
  onStatusChange,
  onContentLoaded,
}: EditorProps) {
  const loadingRef = useRef(true);
  const { resolvedTheme } = useTheme();

  // Ensure persisted cursor-centering config is synced to the mutable module object on mount.
  useCursorCentering();

  const { scheduleSave, saveStatus } = useAutoSave(500, noteId ?? undefined, onNoteSaved);
  const pasteHandler = useLinkPreview();

  useEffect(() => {
    onStatusChange?.(saveStatus);
  }, [saveStatus, onStatusChange]);

  const editor = useCreateBlockNote({
    initialContent: DEFAULT_BLOCKS,
    pasteHandler,
    extensions: [cursorCenteringExtension],
  });

  useLinkClickHandler(editor);

  /**
   * Loads note content into the BlockNote editor when `noteId` changes.
   *
   * - If no `noteId` is provided, the editor is reset to default blocks.
   * - If a `noteId` is given, the persisted content is fetched and parsed.
   *   If parsing fails (e.g. corrupted JSON), the editor falls back to
   *   default blocks.  Network errors are surfaced via a toast notification.
   *
   * The `stale` flag guards against race conditions: when `noteId` changes
   * rapidly, earlier fetch responses are discarded.  `loadingRef` is used
   * by `handleChange` to suppress auto-save until the content has finished
   * loading.
   */
  useEffect(() => {
    let stale = false;
    loadingRef.current = true;
    if (!noteId) {
      editor.replaceBlocks(editor.document, BLOCKS);
      queueMicrotask(() => {
        if (!stale) {
          loadingRef.current = false;
          onContentLoaded?.();
        }
      });
      return;
    }

    getNote(noteId)
      .then((note) => {
        if (stale) return;
        if (note) {
          try {
            editor.replaceBlocks(editor.document, JSON.parse(note.content) as any);
          } catch {
            editor.replaceBlocks(editor.document, BLOCKS);
          }
        } else {
          toast.error("Note not found");
        }
      })
      .catch(() => {
        if (!stale) toast.error("Failed to load note");
      })
      .finally(() => {
        if (!stale) {
          loadingRef.current = false;
          onContentLoaded?.();
        }
      });

    return () => {
      stale = true;
    };
  }, [noteId, editor]);

  /**
   * BlockNote change handler.  Serialises the current document and
   * schedules a debounced save, but only after the initial content
   * has finished loading (guarded by `loadingRef`).
   */
  const handleChange = useCallback(() => {
    if (loadingRef.current) return;
    scheduleSave(JSON.stringify(editor.document));
  }, [editor, scheduleSave]);

  return (
    <div className="w-full px-8 pb-[60vh]">
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        onChange={handleChange}
        formattingToolbar={false}
        linkToolbar={false}
      >
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar blockTypeSelectItems={[]}>
              {formattingToolbarItems}
            </FormattingToolbar>
          )}
        />
        <LinkToolbarController
          linkToolbar={CustomLinkToolbar}
        />
      </BlockNoteView>
    </div>
  );
}
