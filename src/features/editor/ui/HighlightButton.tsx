import {
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";
import { useCallback } from "react";
import { Highlighter } from "lucide-react";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from "@blocknote/react";

/** Background color value used for the yellow highlight style. */
const HIGHLIGHT_COLOR = "yellow";

/**
 * Toolbar button that toggles a yellow highlight on the current text selection.
 *
 * Renders as a {@link Highlighter} icon inside the BlockNote formatting
 * toolbar.  The button is only visible when the editor is editable and at
 * least one selected block contains content.  When the active style already
 * matches the highlight color, the button appears selected and clicking it
 * removes the highlight; otherwise clicking applies it.
 *
 * @returns The formatted toolbar button element, or `null` when the button
 *   should be hidden (read-only editor or empty selection).
 */
export const HighlightButton = () => {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >();

  /**
   * Derives the button's active state from the editor selection.
   *
   * Returns `undefined` when the button should be hidden (read-only editor
   * or no content in the selected blocks).  Otherwise returns an object
   * with an `active` flag that is `true` when the current text cursor or
   * selection already has the highlight background color applied.
   */
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) {
        return undefined;
      }

      const selectedBlocks =
        editor.getSelection()?.blocks || [
          editor.getTextCursorPosition().block,
        ];
      const hasContent = selectedBlocks.some(
        (block) => block.content !== undefined,
      );
      if (!hasContent) {
        return undefined;
      }

      const activeBg = editor.getActiveStyles().backgroundColor;
      return { active: activeBg === HIGHLIGHT_COLOR };
    },
  });

  /** Toggles the yellow highlight background style on the active selection. */
  const toggleHighlight = useCallback(() => {
    editor.focus();
    const style = { backgroundColor: HIGHLIGHT_COLOR } as any;
    const isHighlighted =
      editor.getActiveStyles().backgroundColor === HIGHLIGHT_COLOR;

    if (isHighlighted) {
      editor.removeStyles(style);
    } else {
      editor.addStyles(style);
    }
  }, [editor]);

  if (state === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="highlight"
      onClick={toggleHighlight}
      isSelected={state.active}
      label="Highlight"
      mainTooltip="Highlight"
      icon={<Highlighter size={18} />}
    />
  );
};
