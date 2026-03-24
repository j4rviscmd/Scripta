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
import { SearchReplacePanel } from "./SearchReplacePanel";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";
import { toast } from "sonner";
import { getNote } from "../api/notes";
import { useAutoSave } from "../hooks/useAutoSave";
import { useLinkPreview } from "../hooks/useLinkPreview";
import { useLinkClickHandler } from "../hooks/useLinkClickHandler";
import { useSearchReplace } from "../hooks/useSearchReplace";
import type { SaveStatus } from "..";
import { DEFAULT_BLOCKS } from "../lib/constants";
import { cursorCenteringExtension, searchExtension, useCursorCentering } from "..";
import { useTheme } from "@/app/providers/theme-provider";
import { HighlightButton } from "./HighlightButton";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCKS = DEFAULT_BLOCKS as any;

/**
 * Props for the {@link Editor} component.
 *
 * @property noteId - The ID of the note to load, or `null` for a new untitled note.
 * @property onNoteSaved - Optional callback invoked after the note content is auto-saved.
 * @property onStatusChange - Optional callback invoked whenever the save status changes.
 * @property onContentLoaded - Optional callback invoked once the note content has finished loading.
 */
interface EditorProps {
  noteId: string | null;
  onNoteSaved?: (id: string) => void;
  onStatusChange?: (status: SaveStatus) => void;
  onContentLoaded?: () => void;
}

/**
 * Builds the formatting toolbar item list with a custom highlight button
 * injected after the color-style button.
 *
 * @returns The augmented array of formatting toolbar React elements.
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
 * BlockNote-based rich-text editor with auto-save, link handling,
 * and integrated search & replace.
 *
 * When a `noteId` is provided the component fetches the persisted
 * content from the backend; otherwise it renders the default blank
 * document. Changes are debounced and auto-saved via the
 * {@link useAutoSave} hook.
 */
export function Editor({
  noteId,
  onNoteSaved,
  onStatusChange,
  onContentLoaded,
}: EditorProps) {
  const loadingRef = useRef(true);
  const { resolvedTheme } = useTheme();

  useCursorCentering();

  const { scheduleSave, saveStatus } = useAutoSave(500, noteId ?? undefined, onNoteSaved);
  const pasteHandler = useLinkPreview();

  useEffect(() => {
    onStatusChange?.(saveStatus);
  }, [saveStatus, onStatusChange]);

  const editor = useCreateBlockNote({
    initialContent: DEFAULT_BLOCKS,
    pasteHandler,
    extensions: [cursorCenteringExtension, searchExtension],
  });

  useLinkClickHandler(editor);

  const search = useSearchReplace(editor);

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

  const handleChange = useCallback(() => {
    if (loadingRef.current) return;
    scheduleSave(JSON.stringify(editor.document));
  }, [editor, scheduleSave]);

  return (
    <>
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
      <SearchReplacePanel {...search} />
    </>
  );
}
