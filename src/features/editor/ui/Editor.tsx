import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useCreateBlockNote,
  LinkToolbarController,
} from "@blocknote/react";
import type { BlockNoteEditor } from "@blocknote/core";
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
import { useCopyToast } from "../hooks/useCopyToast";
import { useSearchReplace } from "../hooks/useSearchReplace";
import type { SaveStatus } from "..";
import { DEFAULT_BLOCKS } from "../lib/constants";
import { cursorCenteringExtension, searchExtension, useCursorCentering } from "..";
import { rangeCheckToggleExtension } from "../lib/rangeCheckToggle";
import { useEditorFontSize } from "../hooks/useEditorFontSize";
import { useEditorFont } from "@/app/providers/editor-font-provider";
import { useTheme } from "@/app/providers/theme-provider";
import { HighlightButton } from "./HighlightButton";
import { uploadImage, resolveImageUrl } from "..";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCKS = DEFAULT_BLOCKS as any;

/**
 * Props for the {@link Editor} component.
 *
 * @property noteId - The ID of the note to load, or `null` for a new untitled note.
 * @property onNoteSaved - Optional callback invoked after the note content is auto-saved.
 * @property onStatusChange - Optional callback invoked whenever the save status changes.
 * @property onContentLoaded - Optional callback invoked once the note content has finished loading.
 * @property onSuggestionMenuOpen - Optional callback invoked with the cursor's `clientY`
 *   coordinate when the suggestion menu (slash command palette) opens.
 */
interface EditorProps {
  noteId: string | null;
  onNoteSaved?: (id: string) => void;
  onStatusChange?: (status: SaveStatus) => void;
  onContentLoaded?: () => void;
  /** Called with the cursor's clientY coordinate when the suggestion menu (slash command palette) opens. */
  onSuggestionMenuOpen?: (cursorClientY: number) => void;
}

/**
 * Handle exposed by the {@link Editor} component via `React.forwardRef`.
 *
 * Provides imperative access to the underlying BlockNote editor instance,
 * allowing parent components to read or manipulate editor state directly.
 */
export interface EditorHandle {
  /** The underlying BlockNote editor instance. */
  editor: BlockNoteEditor;
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
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    noteId,
    onNoteSaved,
    onStatusChange,
    onContentLoaded,
    onSuggestionMenuOpen,
  },
  ref,
) {
  const loadingRef = useRef(true);
  const { resolvedTheme } = useTheme();
  const { fontSize } = useEditorFontSize();
  const { fontFamily } = useEditorFont();

  useCursorCentering();

  const { scheduleSave, saveStatus } = useAutoSave(500, noteId ?? undefined, onNoteSaved);
  const pasteHandler = useLinkPreview();

  useEffect(() => {
    onStatusChange?.(saveStatus);
  }, [saveStatus, onStatusChange]);

  const editor = useCreateBlockNote({
    initialContent: DEFAULT_BLOCKS,
    pasteHandler,
    extensions: [cursorCenteringExtension, searchExtension, rangeCheckToggleExtension()],
    uploadFile: uploadImage,
    resolveFileUrl: resolveImageUrl,
  });

  useImperativeHandle(ref, () => ({ editor }), [editor]);

  useLinkClickHandler(editor);
  useCopyToast(editor);

  /**
   * After every file upload completes, ensure the uploaded image block has a
   * non-empty caption so the bubble menu hover-target area remains accessible
   * (see issue #40).
   *
   * When images are pasted via the OS clipboard (e.g. right-click → Copy Image
   * in Chrome), they arrive as `text/html` containing an `<img>` tag.
   * BlockNote's paste handler prioritises `text/html` over `Files`, so the
   * image block is created directly from the HTML without going through
   * `uploadFile` — meaning `onUploadEnd` never fires for this path.
   *
   * This hook still covers the `uploadFile` code-path (e.g. screenshots)
   * where `onUploadEnd` *is* called but the returned caption may not have
   * been applied.
   */
  useEffect(() => {
    const onUploadEnd = (blockId?: string) => {
      if (!blockId) return;
      const block = editor.getBlock(blockId);
      if (
        block &&
        block.type === "image" &&
        typeof block.props === "object" &&
        block.props !== null &&
        "caption" in block.props &&
        (block.props as Record<string, unknown>).caption === ""
      ) {
        const name =
          ("name" in block.props &&
            typeof (block.props as Record<string, unknown>).name === "string" &&
            (block.props as Record<string, unknown>).name) ||
          "image";
        editor.updateBlock(block, {
          props: { caption: name as string },
        } as any);
      }
    };

    return editor.onUploadEnd(onUploadEnd);
  }, [editor]);

  /**
   * Subscribes to the BlockNote SuggestionMenu extension store and calls
   * `onSuggestionMenuOpen` whenever the suggestion menu becomes visible.
   *
   * The store state is `undefined` when the menu is closed, and contains
   * position/query data when it is open.  We track the previous shown state
   * to fire the callback only on the closed→open transition.
   *
   * We defer setup via `editor.onMount()` or immediately if the editor is
   * already mounted, because extensions are registered inside the mount
   * callback and may not yet be available when the React `useEffect` first runs.
   */
  useEffect(() => {
    if (!onSuggestionMenuOpen) return;

    // Narrowed by the guard above — safe to capture in the closure.
    const notifyOpen = onSuggestionMenuOpen;
    let unsubscribeStore: (() => void) | undefined;

    function setupStoreSubscription() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ext = editor.getExtension("suggestionMenu") as { store: { state: unknown; subscribe: (cb: () => void) => () => void } } | undefined;
      if (!ext) return;

      // Start with wasShown = false regardless of the initial store state,
      // so that the first transition to shown always triggers the callback.
      let wasShown = false;
      unsubscribeStore = ext.store.subscribe(() => {
        const state = ext.store.state as { show?: boolean; referencePos?: DOMRect } | undefined;
        // BlockNote's UiElementPosition always has a `show` boolean; use it
        // instead of checking for undefined so we correctly track open/close.
        const isShown = state?.show === true;
        if (isShown && !wasShown) {
          const cursorClientY = state?.referencePos?.top ?? 0;
          // Defer the scroll so it runs after ProseMirror's own scrollIntoView
          // (which fires synchronously on the same transaction).
          requestAnimationFrame(() => notifyOpen(cursorClientY));
        }
        wasShown = isShown;
      });
    }

    // editor.onMount() returns an unsubscribe function at runtime even though
    // the TypeScript declaration says void. We cast to capture it for cleanup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribeMount = (editor.onMount as any)(() => {
      setupStoreSubscription();
    }) as (() => void) | void;

    return () => {
      unsubscribeMount?.();
      unsubscribeStore?.();
    };
  }, [editor, onSuggestionMenuOpen]);

  const search = useSearchReplace(editor);

  /**
   * Walks the editor document tree and sets `caption` to `"image"` on any
   * image block whose caption is empty.  This ensures hover-target areas
   * exist for the formatting toolbar (see issue #40).
   *
   * When a `name` prop is available on the image block (e.g. the alt text
   * extracted from `<img>` HTML), it is used as the caption.  Otherwise
   * falls back to the literal string `"image"`.
   *
   * Must be called while `loadingRef.current === true` so the auto-save
   * guard in `handleChange` prevents unnecessary writes during initial load.
   */
  const backfillImageCaptions = useCallback(() => {
    const walk = (blocks: typeof editor.document) => {
      for (const block of blocks) {
        if (
          block.type === "image" &&
          typeof block.props === "object" &&
          block.props !== null &&
          "caption" in block.props &&
          (block.props as Record<string, unknown>).caption === ""
        ) {
          const props = block.props as Record<string, unknown>;
          const caption =
            (typeof props.name === "string" && props.name) || "image";
          editor.updateBlock(block, { props: { caption } } as any);
        }
        if (block.children?.length) {
          walk(block.children);
        }
      }
    };
    walk(editor.document);
  }, [editor]);

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
      backfillImageCaptions();
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
          backfillImageCaptions();
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
  }, [noteId, editor, backfillImageCaptions]);

  const handleChange = useCallback(() => {
    if (loadingRef.current) return;
    // Ensure every image block has a non-empty caption so the bubble menu
    // hover-target always exists (issue #40).  This covers the `text/html`
    // paste path where `onUploadEnd` is not fired (e.g. right-click → Copy
    // Image in Chrome).  `backfillImageCaptions` only calls `updateBlock`
    // when it actually finds an empty caption, so the subsequent re-trigger
    // of `onChange` is a no-op and does not cause an infinite loop.
    backfillImageCaptions();
    scheduleSave(JSON.stringify(editor.document));
  }, [editor, scheduleSave, backfillImageCaptions]);

  return (
    <>
      <div
        className="w-full px-8 pb-[60vh]"
        data-editor-root
        style={{ "--editor-font-size": `${fontSize}px`, "--editor-font-family": fontFamily } as React.CSSProperties}
      >
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
});
